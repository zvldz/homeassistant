#!/bin/sh

PREFIX=$(expr $(realpath $0) : "\(/.*\)/$(basename $0)\$")
TTMP="/tmp"
TCOOKIE="${TTMP}/tcookie.txt"
TRES_1="${TTMP}/tout_1.txt"
TRES_2="${TTMP}/tout_2.txt"
TURL='https://my.tessla.com.ua'
TUA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/78.0.3904.108 Chrome/78.0.3904.108 Safari/537.36'
# https://github.com/ericchiang/pup
PUP="$PREFIX/pup"

usage() {
    cat << EOF

USAGE: $(basename $0) [OPTIONS]

OPTIONS
    --login=LOGIN
    --password=PASSWORD
    --device-id=DID
    --set-temp=TEMPERATURE
    --status
    --disable-device
    --enable-device
EOF
}

t_auth() {
    curl "${TURL}/?login=yes" \
        --connect-timeout 15 --max-time 30 \
        -s --compressed -L \
        -A "$TUA" \
        -X POST \
        -b $TCOOKIE -c $TCOOKIE \
        -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' \
        -H 'Accept-Language: ru,uk;q=0.9,ru-UA;q=0.8,uk-UA;q=0.7,ru-RU;q=0.6,en-US;q=0.5,en;q=0.4' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -e "${TURL}/" \
        -d "backurl=/" \
        -d "AUTH_FORM=Y" \
        -d "TYPE=AUTH" \
        -d "USER_LOGIN=$TUSER" \
        -d "USER_PASSWORD=$TPASS" \
        > $TRES_1

        if [ ! -f "$TRES_1" ]; then
            echo "result1 don't exist"
            exit 2
        fi

    TSESSID=$($PUP -f $TRES_1 'input#sessid attr{value}')
    TUSERID=$($PUP -f $TRES_1 'input[name=id_user] attr{value}')
}

t_get_status() {
    curl "${TURL}/ajax/get_temperature.php" \
        --connect-timeout 15 --max-time 30 \
        -s --compressed -L \
        -A "$TUA" \
        -X POST \
        -b $TCOOKIE -c $TCOOKIE \
        -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' \
        -H 'Accept-Language: ru,uk;q=0.9,ru-UA;q=0.8,uk-UA;q=0.7,ru-RU;q=0.6,en-US;q=0.5,en;q=0.4' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -e "${TURL}/devices/" \
        -d "sessid=$TSESSID"  \
        -d "id_device=$TDID"  \
        -d "id_user=$TUSERID" \
        > $TRES_2

    if [ ! -f "$TRES_2" ]; then
        echo "result2 don't exist"
        exit 2
    fi

    cat $TRES_2

# Result in json
# TEMPERATURE_1 - control temperature
# TEMPERATURE_2 - current temperature
# RELE - status of reley. 2 - disable. 3 - turn off, 4 - turn on
# ACTIVE - status of device. null - disabled, 5 - enabled
}

t_set_temp() {
    TEMP=$1
    curl "${TURL}/ajax/update_temperature.php" \
        --connect-timeout 15 --max-time 30 \
        -s --compressed -L \
        -A "$TUA" \
        -X POST \
        -b $TCOOKIE -c $TCOOKIE \
        -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' \
        -H 'Accept-Language: ru,uk;q=0.9,ru-UA;q=0.8,uk-UA;q=0.7,ru-RU;q=0.6,en-US;q=0.5,en;q=0.4' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -e "${TURL}/devices/" \
        -d "sessid=$TSESSID"  \
        -d "id_device=$TDID"  \
        -d "id_user=$TUSERID" \
        -d "set_temperature=$TEMP" \
        > /dev/null
}

t_enable() {
    curl "${TURL}/ajax/enable_device.php" \
        --connect-timeout 15 --max-time 30 \
        -s --compressed -L \
        -A "$TUA" \
        -X POST \
        -b $TCOOKIE -c $TCOOKIE \
        -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' \
        -H 'Accept-Language: ru,uk;q=0.9,ru-UA;q=0.8,uk-UA;q=0.7,ru-RU;q=0.6,en-US;q=0.5,en;q=0.4' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -e "${TURL}/devices/" \
        -d "sessid=$TSESSID"  \
        -d "enable_id_device=$TDID"  \
        -d "enable_id_user=$TUSERID" \
        -d "active_device=on" \
        > /dev/null
}

t_disable() {
    curl "${TURL}/ajax/enable_device.php" \
        --connect-timeout 15 --max-time 30 \
        -s --compressed -L \
        -A "$TUA" \
        -X POST \
        -b $TCOOKIE -c $TCOOKIE \
        -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' \
        -H 'Accept-Language: ru,uk;q=0.9,ru-UA;q=0.8,uk-UA;q=0.7,ru-RU;q=0.6,en-US;q=0.5,en;q=0.4' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -e "${TURL}/devices/" \
        -d "sessid=$TSESSID"  \
        -d "enable_id_device=$TDID"  \
        -d "enable_id_user=$TUSERID" \
        > /dev/null
}

if [ "$1" = "" ]; then
    usage
    exit
fi

while [ "$1" != "" ]; do
    PARAM=$(echo $1 | awk -F= '{print $1}')
    VALUE=$(echo $1 | awk -F= '{print $2}')
    case $PARAM in
        -h | --help)
            usage
            exit
            ;;
        --login)
            TUSER=$VALUE
            ;;
        --password)
            TPASS=$VALUE
            ;;
        --device-id)
            TDID=$VALUE
            ;;
        --set-temp)
            TEMPERATURE=$VALUE
            ;;
        --status)
            STATUS=1
            ;;
        --enable-device)
            ENABLE=1
            ;;
        --disable-device)
            DISABLE=1
            ;;
        *)
            echo "ERROR: unknown parameter \"$PARAM\""
            usage
            exit 1
            ;;
    esac
    shift
done

if [ -z "$TUSER" ] || [ -z "$TPASS" ] || [ -z "$TDID" ]; then
    cat << EOF
    --login=LOGIN
    --password=PASSWORD
    --device-id=DID

It is are required parameters.
EOF
    usage
    exit
fi

if [ -n "$ENABLE" ] && [ -n "$DISABLE" ] && [ -n "$TEMPERATURE" ]; then
    cat << EOF
    --enable-device
    --disable-device
    --set-temp

Only one of the parameters can be used.
EOF
    usage
    exit
fi

if [ "$TUSER" = "unknown" ] || [ "$TPASS" = "unknown" ] || [ "$TDID" = "unknown" ]; then
    echo >> ${TTMP}/tlog.txt
    date >> ${TTMP}/tlog.txt
    echo "Parameters is invalid" >> ${TTMP}/tlog.txt
    echo "USER: $TUSER" >> ${TTMP}/tlog.txt
    echo "PASS: $TPASS" >> ${TTMP}/tlog.txt
    echo "DID: $TDID"  >> ${TTMP}/tlog.txt
    echo '{"TEMPERATURE_1":"0","TEMPERATURE_2":"0","RELE":"3","TYPE_USTROYSTVO":"0","ACTIVE":"null"}'
    exit 0
fi

STATUS=${STATUS:-"0"}
ENABLE=${ENABLE:-"0"}
DISABLE=${DISABLE:-"0"}
TEMPERATURE=${TEMPERATURE:-"0"}

if [ $STATUS -eq 0 ] && [ $ENABLE -eq 0 ] && [ $DISABLE -eq 0 ] && [ $TEMPERATURE -eq 0 ]; then
    cat << EOF
    --status
    --enable-device
    --disable-device
    --set-temp

One of the parameters can be used.
EOF
    usage
    exit
fi

t_auth

if [ "$TSESSID" = "" ] || [ "$TUSERID" = "" ];
then
    echo "auth fail"
    exit 3
fi

if [ $STATUS -eq 1 ]; then
    t_get_status
fi

if [ $ENABLE -eq 1 ]; then
    t_enable
fi

if [ $DISABLE -eq 1 ]; then
    t_disable
fi

if [ $TEMPERATURE -ne 0 ]; then
    t_set_temp $TEMPERATURE
fi

exit 0
