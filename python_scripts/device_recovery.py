# Bring back devices whose integration discovers them only at startup and
# never retries. Device list comes from the caller, so this file stays generic.
#
# Per device the caller passes:
#   name    - label for logs and notifications
#   entity  - what goes unavailable and what gets reloaded
#   probe   - binary_sensor telling whether the device answers its own protocol;
#             separates "integration lost it" from "device is deaf" (optional)
#   socket  - switch to cut power when the device is deaf (optional)
#   restore - put a light back on after a power cycle; never decide for it,
#             or we would fight the room automations (optional)
import logging
import time

# Own logger so its level can be tuned from includes/logger.yaml without
# turning on debug for the whole python_script component.
log = logging.getLogger("recovery.devices")

# Two independent ladders. We never give up: conditions change on their own
# (power comes back, someone plugs the device in again), and an integration
# that decides "everything has been tried" is exactly the behaviour we are
# working around here. Instead the intervals grow and level off.
GRACE = 180       # ignore short blips before acting
SOFT_BASE = 60    # reload: 1, 2, 4, 8 min ...
SOFT_MAX = 600    # ... capped at 10 min, same as HA core does for setup retry
HARD_BASE = 1800  # power cycle: not more often than every 30 min
HARD_MAX = 21600  # ... backing off to 6 h for a device that stays dead
SETTLE = 45       # after a power cycle: measured ~60 s until the lamp answers
WAIT_BACK = 90    # how long to wait for the entity before restoring its state
POLL = 5
SLACK = 10        # tolerance so a wait equal to the trigger interval still fires
STATE_TTL = 1800  # do not act on a memory older than this

st = hass.data.setdefault("device_recovery", {})
now = time.time()


def state_of(entity_id):
    obj = hass.states.get(entity_id)
    return obj.state if obj else None


def remember(rec, dev, entity_id):
    """Keep the last known light state so a power cycle can be undone."""
    if not dev.get("restore"):
        return
    rec["seen"] = now
    if state_of(entity_id) == "on":
        obj = hass.states.get(entity_id)
        rec["was_on"] = True
        rec["bri"] = obj.attributes.get("brightness")
    else:
        rec["was_on"] = False


def power_cycle(socket):
    hass.services.call("switch", "turn_off", {"entity_id": socket})
    time.sleep(15)
    hass.services.call("switch", "turn_on", {"entity_id": socket})
    time.sleep(SETTLE)


def restore(rec, entity_id):
    """Put the light back the way it was before we cut its power.

    Works both ways: Yeelight lamps have a "power on as off" setting, but it
    does not always hold, so a lamp can come back lit when it should be dark.

    A fixed sleep is not enough here - the entity may still be unavailable,
    and then the restore would silently do nothing.
    """
    if "was_on" not in rec:
        return
    # a stale memory is worse than doing nothing: a lamp that went dark hours
    # ago must not light up in the middle of the night
    if now - rec.get("seen", 0) > STATE_TTL:
        log.info("%s: remembered state is stale, leaving it alone", entity_id)
        return

    waited = 0
    while state_of(entity_id) == "unavailable" and waited < WAIT_BACK:
        time.sleep(POLL)
        waited += POLL

    current = state_of(entity_id)
    if rec["was_on"] and current == "off":
        payload = {"entity_id": entity_id}
        if rec.get("bri"):
            payload["brightness"] = rec["bri"]
        hass.services.call("light", "turn_on", payload)
        log.info("%s: was on before the power cut, turned back on", entity_id)
    elif not rec["was_on"] and current == "on":
        hass.services.call("light", "turn_off", {"entity_id": entity_id})
        log.info("%s: came back lit but was off before, turned off", entity_id)


seen = []

for dev in data.get("devices", []):
    entity_id = dev["entity"]
    rec = st.setdefault(entity_id, {})
    current = state_of(entity_id)

    seen.append("%s=%s" % (dev["name"], current))

    if current is None:
        continue

    if current != "unavailable":
        if rec.get("tries"):
            log.info("%s is back after %d attempt(s)", dev["name"], rec["tries"])
            hass.services.call("telegram_bot", "send_message", {
                "disable_notification": True,
                "message": "Recovery: %s is back" % dev["name"],
            })
        remember(rec, dev, entity_id)
        rec.pop("since", None)
        rec.pop("last", None)
        rec.pop("tries", None)
        rec.pop("hard", None)
        rec.pop("hard_last", None)
        continue

    rec.setdefault("since", now)
    if now - rec["since"] < GRACE:
        continue

    # SLACK: the automation fires on a fixed interval, so an exact comparison
    # loses a whole cycle whenever the wait is a multiple of that interval.
    tries = rec.get("tries", 0)
    wait = min(SOFT_BASE * 2 ** tries, SOFT_MAX)
    if now - rec.get("last", 0) < wait - SLACK:
        log.debug("%s: unavailable %ds, next attempt in %ds",
                  dev["name"], int(now - rec["since"]), int(wait - (now - rec["last"])))
        continue
    rec["last"] = now
    rec["tries"] = tries + 1

    probe = dev.get("probe")
    deaf = bool(probe) and state_of(probe) == "off"
    socket = dev.get("socket")

    # cutting power is the heavier tool, so it gets its own slower ladder
    hard = rec.get("hard", 0)
    hard_wait = min(HARD_BASE * 2 ** hard, HARD_MAX)
    may_cut = now - rec.get("hard_last", 0) >= hard_wait - SLACK
    if deaf and socket and not may_cut:
        log.debug("%s: deaf but power cycle on cooldown, %ds left",
                  dev["name"], int(hard_wait - (now - rec["hard_last"])))

    if deaf and socket and may_cut:
        rec["hard_last"] = now
        rec["hard"] = hard + 1
        power_cycle(socket)
        action = "power-cycled"
    else:
        action = "reloaded"

    hass.services.call("homeassistant", "reload_config_entry",
                       {"entity_id": entity_id})

    # only after a power cycle: that is the one case where WE dropped the
    # state. After a plain reload the lamp may be off because someone switched
    # it off by hand while the entity was unavailable - turning it back on
    # would be wrong.
    if action == "power-cycled" and dev.get("restore"):
        restore(rec, entity_id)

    log.info("%s: %s (attempt %d, deaf=%s)", dev["name"], action, tries + 1, deaf)
    # notify on the first attempt only; repeats would spam for a dead device
    if tries == 0:
        hass.services.call("telegram_bot", "send_message", {
            "disable_notification": True,
            "message": "Recovery: %s %s" % (dev["name"], action),
        })

# one line per run, so the history shows the script was alive and what it saw
log.debug("checked %d device(s): %s", len(seen), ", ".join(seen))
