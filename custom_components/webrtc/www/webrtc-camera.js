/** Chrome 63+, Safari 11.1+ */
import {VideoRTC} from "./video-rtc.js";

class WebRTCCamera extends VideoRTC {
    constructor() {
        super();

        /**
         * @type {{
         *     url:string, entity:string, muted:boolean, poster:string, title:string,
         *     intersection:number, ui:boolean, style:string,
         *     ptz:{
         *         opacity:number|string, service:string,
         *         data_left, data_up, data_right, data_down,
         *         data_zoom_in, data_zoom_out, data_home
         *     },
         *     shortcuts:Array<{name:string,icon:string}>,
         *     mse:boolean, webrtc:boolean,
         * }} config
         */
        this.config = null;

        /** @type {HTMLDivElement} */
        this.divMode = null;
        /** @type {HTMLDivElement} */
        this.divStatus = null;
    }

    /**
     * Step 1. Called by the Hass, when config changed.
     * @param {Object} config
     */
    setConfig(config) {
        if (!config.url && !config.entity) throw new Error("Missing `url` or `entity`");

        if (config.mode) this.mode = config.mode;
        // backward compatibility
        else if (config.mse === false) this.mode = 'webrtc';
        else if (config.webrtc === false) this.mode = 'mse';

        if (config.background) this.background = config.background;
        if (config.intersection) this.visibilityThreshold = config.intersection;

        this.config = config;
    }

    set hass(hass) {
        // if card in vertical stack - `hass` property assign after `onconnect`
        super.hass = hass;
        this.onconnect();
    }

    /**
     * Called by the Hass to calculate default card height.
     */
    getCardSize() {
        return 5; // x 50px
    }

    /**
     * Called by the Hass to get defaul card config
     * @returns {{url: string}}
     */
    static getStubConfig() {
        return {'url': ''}
    }

    oninit() {
        super.oninit();
        this.renderMain();
        this.renderPTZ();
        this.renderCustomUI();
        this.renderShortcuts();
        this.renderStyle();
    }

    onconnect() {
        if (!this.config || !this.hass) return false;
        if (!this.isConnected || this.ws || this.pc) return false;

        if (this.divMode.innerText === 'loading1') return;

        this.divMode.innerText = 'loading1';

        this.hass.callWS({
            type: 'auth/sign_path', path: '/api/webrtc/ws'
        }).then(data => {
            this.wsURL = 'ws' + this.hass.hassUrl(data.path).substring(4);
            if (this.config.url) {
                this.wsURL += '&url=' + encodeURIComponent(this.config.url);
            }
            if (this.config.entity) {
                this.wsURL += '&entity=' + this.config.entity;
            }
            if (super.onconnect()) {
                this.divMode.innerText = 'loading2';
            } else {
                this.divMode.innerText = 'error2';
            }
        }).catch(() => {
            this.divMode.innerText = 'error1';
        });
    }

    onopen() {
        const result = super.onopen();

        this.onmessage['stream'] = msg => {
            switch (msg.type) {
                case 'error':
                    this.divMode.innerText = 'error';
                    this.divStatus.innerText = msg.value;
                    break;
                case 'mse':
                case 'mp4':
                case 'mjpeg':
                    this.divMode.innerText = msg.type.toUpperCase();
                    this.divStatus.innerText = '';
                    break;
            }
        }

        return result;
    }

    onpcvideo(ev) {
        super.onpcvideo(ev);

        if (this.pcState !== WebSocket.CLOSED) {
            this.divMode.innerText = 'RTC';
            this.divStatus.innerText = '';
        }
    }

    renderMain() {
        this.innerHTML = `
        <style>
            ha-card {
                width: 100%;
                height: 100%;
                margin: auto;
                overflow: hidden;
                position: relative;
            }
            ha-icon {
                color: white;
                cursor: pointer;
            }
            .player {
                background-color: black;
                height: 100%;
            }
            .header {
                position: absolute;
                top: 6px;
                left: 10px;
                right: 10px;
                color: white;
                display: flex;
                justify-content: space-between;
                pointer-events: none;
            }
            .mode {
                opacity: 0.6;
            }
        </style>
        <ha-card class="card">
            <div class="player"></div>
            <div class="header">
                <div class="status"></div>
                <div class="mode"></div>
            </div>
        </ha-card>
        `;

        this.divMode = this.querySelector(".mode");
        this.divStatus = this.querySelector(".status");

        this.querySelector(".player").appendChild(this.video);

        if (this.config.muted) this.video.muted = true;
        if (this.config.poster) this.video.poster = this.config.poster;
    }

    renderPTZ() {
        if (!this.config.ptz || !this.config.ptz.service) return;

        const hasMove = this.config.ptz.data_right;
        const hasZoom = this.config.ptz.data_zoom_in;
        const hasHome = this.config.ptz.data_home;

        const card = this.querySelector('.card');
        card.insertAdjacentHTML('beforebegin', `
            <style>
                .ptz {
                    position: absolute;
                    top: 50%;
                    right: 10px;
                    transform: translateY(-50%);
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    transition: opacity .3s ease-in-out;
                    opacity: ${parseFloat(this.config.ptz.opacity) || 0.4};
                }
                .ptz:hover {
                    opacity: 1 !important;
                }
                .ptz-move {
                    position: relative;
                    background-color: rgba(0, 0, 0, 0.3);
                    border-radius: 50%;
                    width: 80px;
                    height: 80px;
                    display: ${hasMove ? 'block' : 'none'};
                }
                .ptz-zoom {
                    position: relative;
                    width: 80px;
                    height: 40px;
                    background-color: rgba(0, 0, 0, 0.3);
                    border-radius: 4px;
                    display: ${hasZoom ? 'block' : 'none'};
                }
                .ptz-home {
                    position: relative;
                    width: 40px;
                    height: 40px;
                    background-color: rgba(0, 0, 0, 0.3);
                    border-radius: 4px;
                    align-self: center;
                    display: ${hasHome ? 'block' : 'none'};
                }
                .up {
                    position: absolute;
                    top: 5px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .down {
                    position: absolute;
                    bottom: 5px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .left {
                    position: absolute;
                    left: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .right {
                    position: absolute;
                    right: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .zoom_out {
                    position: absolute;
                    left: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .zoom_in {
                    position: absolute;
                    right: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .home {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
            </style>
        `);
        card.insertAdjacentHTML('beforeend', `
            <div class="ptz">
                <div class="ptz-move">
                    <ha-icon class="right" icon="mdi:arrow-right"></ha-icon>
                    <ha-icon class="left" icon="mdi:arrow-left"></ha-icon>
                    <ha-icon class="up" icon="mdi:arrow-up"></ha-icon>
                    <ha-icon class="down" icon="mdi:arrow-down"></ha-icon>
                </div>
                <div class="ptz-zoom">
                    <ha-icon class="zoom_in" icon="mdi:plus"></ha-icon>
                    <ha-icon class="zoom_out" icon="mdi:minus"></ha-icon>
                </div>
                <div class="ptz-home">
                    <ha-icon class="home" icon="mdi:home"></ha-icon>
                </div>
            </div>
        `);

        const ptz = this.querySelector('.ptz')
        ptz.addEventListener('click', ev => {
            const data = this.config.ptz['data_' + ev.target.className];
            if (!data) return;

            const [domain, service] = this.config.ptz.service.split('.', 2);
            this.hass.callService(domain, service, data);
        });
    }

    renderCustomUI() {
        if (!this.config.ui) return;

        this.video.controls = false;
        this.video.style.pointerEvents = 'none';

        const card = this.querySelector('.card');
        card.insertAdjacentHTML('beforebegin', `
            <style>
                .spinner {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                .controls {
                    position: absolute;
                    left: 5px;
                    right: 5px;
                    bottom: 5px;
                    display: flex;
                }
                .space {
                    width: 100%;
                }
            </style>
        `);
        card.insertAdjacentHTML('beforeend', `
            <div class="ui">
                <ha-circular-progress class="spinner"></ha-circular-progress>
                <div class="controls">
                    <ha-icon class="fullscreen" icon="mdi:fullscreen"></ha-icon>
                    <span class="space"></span>
                    <ha-icon class="volume" icon="mdi:volume-high"></ha-icon>
                </div>
            </div>
        `);

        const video = this.video;

        const ui = this.querySelector('.ui');
        ui.addEventListener('click', ev => {
            const icon = ev.target.icon;
            if (icon === 'mdi:volume-mute') {
                video.muted = false;
            } else if (icon === 'mdi:volume-high') {
                video.muted = true;
            } else if (icon === 'mdi:fullscreen') {
                this.requestFullscreen().then(); // Chrome 71
            } else if (icon === 'mdi:fullscreen-exit') {
                document.exitFullscreen().then();
            }
        });

        const spinner = this.querySelector('.spinner');
        video.addEventListener('waiting', () => {
            spinner.style.display = 'block';
        });
        video.addEventListener('playing', () => {
            spinner.style.display = 'none';
        });

        const volume = this.querySelector('.volume');
        video.addEventListener('loadeddata', () => {
            volume.style.display = this.hasAudio ? 'block' : 'none';
            // volume.icon = video.muted ? 'mdi:volume-mute' : 'mdi:volume-high';
        });
        video.addEventListener('volumechange', () => {
            volume.icon = video.muted ? 'mdi:volume-mute' : 'mdi:volume-high';
        });

        const fullscreen = this.querySelector('.fullscreen');
        this.addEventListener('fullscreenchange', () => {
            fullscreen.icon = document.fullscreenElement
                ? 'mdi:fullscreen-exit' : 'mdi:fullscreen';
        });
    }

    renderShortcuts() {
        if (!this.config.shortcuts) return;

        // backward compatibility with `services` property
        const services = this.config.shortcuts.services || this.config.shortcuts;

        const icons = services.map((value, index) => `
            <ha-icon data-index="${index}" icon="${value.icon}" title="${value.name}"></ha-icon>
        `).join("");

        const card = this.querySelector('.card');
        card.insertAdjacentHTML('beforebegin', `
        <style>
            .shortcuts {
                position: absolute;
                top: 5px;
                left: 5px;
            }
        </style>
        `);
        card.insertAdjacentHTML('beforeend', `
        <div class="shortcuts">${icons}</div>
        `);

        const shortcuts = this.querySelector('.shortcuts');
        shortcuts.addEventListener('click', ev => {
            const value = services[ev.target.dataset.index];
            const [domain, name] = value.service.split('.');
            this.hass.callService(domain, name, value.service_data || {});
        });
    }

    renderStyle() {
        if (!this.config.style) return;

        const style = document.createElement('style');
        style.innerText = this.config.style;
        const card = this.querySelector('.card');
        card.insertAdjacentElement('beforebegin', style);
    }

    get hasAudio() {
        return (
            (this.video.srcObject && this.video.srcObject.getAudioTracks().length) ||
            (this.video.mozHasAudio || this.video.webkitAudioDecodedByteCount) ||
            (this.video.audioTracks && this.video.audioTracks.length)
        );
    }
}

customElements.define('webrtc-camera', WebRTCCamera);

window.customCards ||= [];
window.customCards.push({
    type: 'webrtc-camera',
    name: 'WebRTC Camera',
    preview: false,
    description: 'WebRTC camera allows you to view the stream of almost any camera without delay',
});
