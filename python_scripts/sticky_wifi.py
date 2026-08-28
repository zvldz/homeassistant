# Re-associate WiFi devices that cannot roam on their own.
#
# Chips without 802.11k/v/r stay glued to whatever AP they hit after a reboot,
# even when a much closer one is available, and never move until the link dies
# completely. Kicking them off the AP makes them pick again.
#
# Caller passes:
#   watch       - {mac: name} of devices to manage; phones and laptops are
#                 deliberately left out, they roam fine and react badly
#   ap_rebooted - true when triggered by a router reboot: the picture changed,
#                 so forget which devices had nowhere better to go
#
# Router credentials come from the mikrotik_router config entry, so no secrets
# live in the config repo.
import logging
import time

# Own logger, tunable from includes/logger.yaml.
log = logging.getLogger("recovery.wifi")

import requests
from requests.auth import HTTPBasicAuth

THRESHOLD = -65   # kick when the signal is worse than this
COOLDOWN = 3600   # per device, seconds
STUCK_TTL = 21600 # remember "this IS its best AP" for 6h
MIN_GAIN = 5      # dB improvement that makes a kick worthwhile

watch = data.get("watch", {})
st = hass.data.setdefault("wifi_kick", {})
now = time.time()

if str(data.get("ap_rebooted")).lower() == "true":
    for rec in st.values():
        rec.pop("stuck_until", None)


def capsman_master():
    """The master is the router that actually reports associated clients."""
    for entry in hass.config_entries.async_entries("mikrotik_router"):
        cfg = entry.data
        auth = HTTPBasicAuth(cfg["username"], cfg["password"])
        base = "http://%s/rest" % cfg["host"]
        try:
            table = requests.get(base + "/interface/wifi/registration-table",
                                 auth=auth, timeout=5).json()
        except Exception:
            continue
        if table:
            return table, auth, base
    return None, None, None


def judge_previous_kick(rec, iface, signal):
    """Same AP and no real gain means the device already sits on its best AP."""
    if not rec.get("pending"):
        return
    if iface == rec.get("iface") and signal <= rec.get("signal", 0) + MIN_GAIN:
        rec["stuck_until"] = now + STUCK_TTL
    rec["pending"] = False


def may_kick(rec, signal):
    return (signal < THRESHOLD
            and now >= rec.get("stuck_until", 0)
            and now - rec.get("last", 0) >= COOLDOWN)


table, auth, base = capsman_master()
if table is None:
    log.warning("no CAPsMAN master answered, nothing to do")
kicked = []

for client in table or []:
    mac = client.get("mac-address")
    if mac not in watch:
        continue
    try:
        signal = int(client.get("signal"))
    except Exception:
        continue

    iface = client.get("interface", "")
    rec = st.setdefault(mac, {})
    judge_previous_kick(rec, iface, signal)

    if signal < THRESHOLD and not may_kick(rec, signal):
        reason = "best AP already" if now < rec.get("stuck_until", 0) else "cooldown"
        log.debug("%s: %s dBm on %s, skipped (%s)", watch[mac], signal, iface, reason)

    if may_kick(rec, signal):
        try:
            requests.delete(base + "/interface/wifi/registration-table/" + client[".id"],
                            auth=auth, timeout=5)
            rec.update(last=now, iface=iface, signal=signal, pending=True)
            kicked.append("%s %s %s" % (watch[mac], iface, signal))
        except Exception as err:
            log.warning("kick %s failed: %s", mac, err)

if kicked:
    log.info("re-associated %s", ", ".join(kicked))
    hass.services.call("telegram_bot", "send_message", {
        "disable_notification": True,
        "message": "WiFi: re-associated " + ", ".join(kicked),
    })

# one line per run, so the history shows the script was alive and what it saw
watched = [c for c in (table or []) if c.get("mac-address") in watch]
log.debug("checked %d of %d watched client(s): %s", len(watched), len(watch),
          ", ".join("%s %s %s" % (watch[c["mac-address"]], c.get("interface"),
                                  c.get("signal")) for c in watched))
