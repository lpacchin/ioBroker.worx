"use strict";

/*
 * Created with @iobroker/create-adapter v1.11.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

const worx = require(__dirname + '/lib/api');
const week = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ERRORCODES = {
    0: 'No error',
    1: 'Trapped',
    2: 'Lifted',
    3: 'Wire missing',
    4: 'Outside wire',
    5: 'Raining',
    6: 'Close door to mow',
    7: 'Close door to go home',
    8: 'Blade motor blocked',
    9: 'Wheel motor blocked',
    10: 'Trapped timeout',
    11: 'Upside down',
    12: 'Battery low',
    13: 'Reverse wire',
    14: 'Charge error',
    15: 'Timeout finding home',
    16: 'Mower locked',
    17: 'Battery over temperature',
};
const STATUSCODES = {
    0: 'IDLE',
    1: 'Home',
    2: 'Start sequence',
    3: 'Leaving home',
    4: 'Follow wire',
    5: 'Searching home',
    6: 'Searching wire',
    7: 'Mowing',
    8: 'Lifted',
    9: 'Trapped',
    10: 'Blade blocked',
    11: 'Debug',
    12: 'Remote control',
    30: 'Going home',
    32: 'Border Cut',
    33: 'Searching zone',
    34: 'Pause'
};
const WEATHERINTERVALL = 60000 * 30 // = 30 min.

class Worx extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "worx",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
    async onReady() {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info('config e-mail: ' + this.config.mail);
        this.log.info('config password: ' + this.config.password);
        this.log.info('config mower: ' + this.config.mower);

        this.setStateAsync('info.connection', {
            val: false,
            ack: true
        });
        const WorxCloud = new worx(this.config.mail, this.config.password);

        WorxCloud.on('connect', worxc => {
            this.log.info('sucess conect!');
            this.setStateAsync('info.connection', {
                val: true,
                ack: true
            });
        });

        let that = this
        WorxCloud.on('found', function (mower) {

            that.log.info('found!' + JSON.stringify(mower));
            that.createDevices(mower).then(_ => {
                mower.status().then(status => {
                    setTimeout(function () {
                        that.setStates(mower.serial, status);
                    }, 1000);


                });
            });
            that.UpdateWeather(mower);

            mower.connectMqtt().then(data => {
                that.log.info(data);
            });

            mower.on('mqtt', (serial, data) => {
                that.log.info(JSON.stringify(serial + " " + JSON.stringify(data)));
                that.setStates(mower.serial, data);
            });

        });

        WorxCloud.on('error', err => {
            this.log.error('ERROR: ' + err);
            this.setStateAsync('info.connection', {
                val: false,
                ack: true
            });
        });

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');

        /*
        setState examples
        you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        await this.setStateAsync('testVariable', true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        await this.setStateAsync('testVariable', {
            val: true,
            ack: true
        });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        await this.setStateAsync('testVariable', {
            val: true,
            ack: true,
            expire: 30
        });

        // examples for the checkPassword/checkGroup functions
        let result = await this.checkPasswordAsync('admin', 'iobroker');
        this.log.info('check user admin pw ioboker: ' + result);

        result = await this.checkGroupAsync('admin', 'admin');
        this.log.info('check group user admin group admin: ' + result);

    }
    setStates(mowerSerial, data) {
        let that = this;
        //mower set states
        var sequence = [];

        if (that.config.houerKm) {
            that.setStateAsync(mowerSerial + '.mower.totalTime', {
                val: (data.dat.st && data.dat.st.wt ? data.dat.st.wt : null),
                ack: true
            });
            that.setStateAsync(mowerSerial + ".mower.totalDistance", {
                val: (data.dat.st && data.dat.st.d ? data.dat.st.d : null),
                ack: true
            });
            that.setStateAsync(mowerSerial + ".mower.totalBladeTime", {
                val: (data.dat.st && data.dat.st.b ? data.dat.st.b : null),
                ack: true
            });
        } else {
            that.setStateAsync(mowerSerial + ".mower.totalTime", {
                val: (data.dat.st && data.dat.st.wt ? Math.round(data.dat.st.wt / 6) / 10 : null),
                ack: true
            });
            that.setStateAsync(mowerSerial + ".mower.totalDistance", {
                val: (data.dat.st && data.dat.st.d ? Math.round(data.dat.st.d / 100) / 10 : null),
                ack: true
            });
            that.setStateAsync(mowerSerial + ".mower.totalBladeTime", {
                val: (data.dat.st && data.dat.st.b ? Math.round(data.dat.st.b / 6) / 10 : null),
                ack: true
            });
        }


        that.setStateAsync(mowerSerial + ".mower.batteryChargeCycle", {
            val: (data.dat.bt && data.dat.bt.nr ? data.dat.bt.nr : null),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.batteryCharging", {
            val: (data.dat.bt && data.dat.bt.c ? true : false),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.batteryVoltage", {
            val: (data.dat.bt && data.dat.bt.v ? data.dat.bt.v : null),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.batteryTemterature", {
            val: (data.dat.bt && data.dat.bt.t ? data.dat.bt.t : null),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.error", {
            val: (data.dat && data.dat.le ? data.dat.le : 0),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.status", {
            val: (data.dat && data.dat.ls ? data.dat.ls : 0),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.wifiQuality", {
            val: (data.dat && data.dat.rsi ? data.dat.rsi : 0),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.mowerActive", {
            val: (data.cfg.sc && data.cfg.sc.m ? true : false),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.mowTimeExtend", {
            val: (data.cfg.sc && data.cfg.sc.p ? data.cfg.sc.p : 0),
            ack: true
        });

        // sort Areas
        that.setStateAsync(mowerSerial + ".areas.area_0", {
            val: (data.cfg.mz && data.cfg.mz[0] ? data.cfg.mz[0] : 0),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".areas.area_1", {
            val: (data.cfg.mz && data.cfg.mz[1] ? data.cfg.mz[1] : 0),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".areas.area_2", {
            val: (data.cfg.mz && data.cfg.mz[2] ? data.cfg.mz[2] : 0),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".areas.area_3", {
            val: (data.cfg.mz && data.cfg.mz[3] ? data.cfg.mz[3] : 0),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".areas.actualArea", {
            val: (data.dat ? data.cfg.mzv[data.dat.lz] : null),
            ack: true
        });
        that.setStateAsync(mowerSerial + ".areas.actualAreaIndicator", {
            val: (data.dat && data.dat.lz ? data.dat.lz : null),
            ack: true
        });

        that.setStateAsync(mowerSerial + ".mower.firmware", {
            val: data.dat.fw,
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.waitRain", {
            val: data.cfg.rd,
            ack: true
        });
        that.setStateAsync(mowerSerial + ".mower.batteryState", {
            val: data.dat.bt.p,
            ack: true
        });

        for (var i = 0; i < data.cfg.mzv.length; i++) {
            //  adapter.setState("areas.startSequence", { val: data.cfg.mzv[i], ack: true });
            sequence.push(data.cfg.mzv[i]);
        }
        that.setStateAsync(mowerSerial + ".areas.startSequence", {
            val: (sequence),
            ack: true
        });

        let state = (data.dat && data.dat.ls ? data.dat.ls : 0);
        let error = (data.dat && data.dat.le ? data.dat.le : 0);

        if ((state === 7 || state === 9) && error === 0) {
            that.setStateAsync(mowerSerial + ".mower.state", {
                val: true,
                ack: true
            });
        } else {
            that.setStateAsync(mowerSerial + ".mower.state", {
                val: false,
                ack: true
            });
        }
        evaluateCalendar(data.cfg.sc.d);
        //Calendar
        function evaluateCalendar(arr) {
            if (arr) {
        
                for (var i = 0; i < week.length; i++) {
                    that.setStateAsync(mowerSerial +".calendar." + week[i] + ".startTime", { val: arr[i][0], ack: true });
                    that.setStateAsync(mowerSerial +".calendar." + week[i] + ".workTime", { val: arr[i][1], ack: true });
                    that.setStateAsync(mowerSerial +".calendar." + week[i] + ".borderCut", { val: (arr[i][2] && arr[i][2] === 1 ? true : false), ack: true });
        
        
                }
            }
        }
    }

    UpdateWeather(mower) {
        let that = this;
        that.log.info("Weather_ " + JSON.stringify(mower));
        getWeather();
        setInterval(getWeather, WEATHERINTERVALL);

        function getWeather() {
            mower.weather().then(weather => {
                that.log.info("Weather_ " + JSON.stringify(weather));
                that.log.info("Weather_d " + new Date(weather.dt * 1000));
                that.setStateAsync(mower.serial + '.weather.clouds', {
                    val: weather.clouds.all,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.description', {
                    val: weather.weather[0].description,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.main', {
                    val: weather.weather[0].main,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.icon', {
                    val: weather.weather[0].icon,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.humidity', {
                    val: weather.main.humidity,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.temp', {
                    val: weather.main.temp,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.temp_min', {
                    val: weather.main.temp_min,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.temp_max', {
                    val: weather.main.temp_max,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.pressure', {
                    val: weather.main.pressure,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.wind_speed', {
                    val: weather.wind.speed,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.wind_deg', {
                    val: weather.wind.deg,
                    ack: true
                });
                that.setStateAsync(mower.serial + '.weather.lastUpdate', {
                    val: new Date((weather.dt * 1000)),
                    ack: true
                });
            })
        }
    }
    /**
     * @param {{ serial: string; raw: { name: string; }; }} mower
     */
    async createDevices(mower) {
        let that = this;
        await that.setObjectNotExistsAsync(mower.serial, {
            type: 'device',
            role: 'mower',
            common: {
                name: mower.raw.name
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.areas', {
            type: 'channel',
            role: 'mower.areas',
            common: {
                name: 'mower areas'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.calendar', {
            type: 'channel',
            role: 'mower.calendar',
            common: {
                name: 'mower calendar'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower', {
            type: 'channel',
            role: 'mower.control',
            common: {
                name: 'mower control'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather', {
            type: 'channel',
            role: 'weather',
            common: {
                name: 'mower control'
            },
            native: {}
        });

        for (let a = 0; a <= 3; a++) {

            await that.setObjectNotExistsAsync(mower.serial + '.areas.area_' + a, {
                type: 'state',
                common: {
                    name: 'Area' + a,
                    type: 'number',
                    role: 'value',
                    unit: 'm',
                    read: true,
                    write: true,
                    desc: 'Distance from Start point for area ' + a
                },
                native: {}
            });
        }

        await that.setObjectNotExistsAsync(mower.serial + '.areas.actualArea', {
            type: 'state',
            common: {
                name: 'Actual area',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                desc: 'Show the current area'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.areas.actualAreaIndicator', {
            type: 'state',
            common: {
                name: 'Actual area',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                desc: 'Show the current area'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.areas.startSequence', {
            type: 'state',
            common: {
                name: 'Start sequence',
                type: 'string',
                role: 'value',
                read: true,
                write: true,
                desc: 'Sequence of area to start from'
            },
            native: {}
        });

        //calendar
        week.forEach(function (day) {
            that.setObjectNotExistsAsync(mower.serial + '.calendar.' + day + '.borderCut', {
                type: 'state',
                common: {
                    name: 'Border cut',
                    type: 'boolean',
                    role: 'switch',
                    read: true,
                    write: true,
                    desc: 'The mower cut border today'
                },
                native: {}
            });
            that.setObjectNotExistsAsync(mower.serial + '.calendar.' + day + '.startTime', {
                type: 'state',
                common: {
                    name: 'Start time',
                    type: 'string',
                    role: 'value.datetime',
                    read: true,
                    write: true,
                    desc: 'Hour:Minutes on' + day + ' that the Landroid should start mowing'
                },
                native: {}
            });
            that.setObjectNotExistsAsync(mower.serial + '.calendar.' + day + '.workTime', {
                type: 'state',
                common: {
                    name: 'Work time',
                    type: 'number',
                    role: 'value.interval',
                    unit: 'min.',
                    read: true,
                    write: true,
                    desc: 'Decides for how long the mower will work on ' + day
                },
                native: {}
            });
        });
        // mower
        await that.setObjectNotExistsAsync(mower.serial + '.mower.online', {
            type: 'state',
            common: {
                name: 'Online',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
                desc: 'If mower connected to cloud'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.firmware', {
            type: 'state',
            common: {
                name: 'Firmware Version',
                type: 'string',
                role: 'meta.version',
                read: true,
                write: false,
                desc: 'Firmware Version'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.wifiQuality', {
            type: 'state',
            common: {
                name: 'Wifi quality',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                unit: 'dBm',
                desc: 'Prozent of Wifi quality'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.batteryChargeCycle', {
            type: 'state',
            common: {
                name: 'Battery charge cycle',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
                desc: 'Show the number of charging cycles'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.batteryCharging', {
            type: 'state',
            common: {
                name: 'Battery charger state',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                desc: 'Battery charger state'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.batteryState', {
            type: 'state',
            common: {
                name: 'Landroid battery state',
                type: 'number',
                role: 'value.battery',
                read: true,
                write: false,
                unit: '%',
                desc: 'Landroid mower battery state in %'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.batteryTemterature', {
            type: 'state',
            common: {
                name: 'Battery temperature',
                type: 'number',
                role: 'value.temperature',
                read: true,
                write: false,
                unit: '°C',
                desc: 'Temperature of movers battery'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.batteryVoltage', {
            type: 'state',
            common: {
                name: 'Battery voltage',
                type: 'number',
                role: 'value.voltage',
                read: true,
                write: false,
                unit: 'V',
                desc: 'Voltage of movers battery'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.error', {
            type: 'state',
            common: {
                name: 'Error code',
                type: 'number',
                role: 'value.voltage',
                read: true,
                write: false,
                desc: 'Error code',
                states: ERRORCODES
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.pause', {
            type: 'state',
            common: {
                name: 'Pause',
                type: 'boolean',
                role: 'button.stop',
                read: true,
                write: true,
                desc: 'Pause the mover'

            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.state', {
            type: 'state',
            common: {
                name: 'Start/Stop',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                desc: 'Start and stop the mover'

            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.status', {
            type: 'state',
            common: {
                name: 'Landroid status',
                type: 'number',
                role: 'indicator.status',
                read: true,
                write: false,
                desc: 'Current status of lawn mower',
                states: STATUSCODES

            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.totalBladeTime', {
            type: 'state',
            common: {
                name: 'Runtime of the blades',
                type: 'number',
                role: 'value.interval',
                read: true,
                write: false,
                unit: 'h',
                desc: 'Total blade is running'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.totalDistance', {
            type: 'state',
            common: {
                name: 'Total mower distance',
                type: 'number',
                role: 'value.interval',
                read: true,
                write: false,
                unit: 'km',
                desc: 'Total distance the mower has been mowing in km'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.totalTime', {
            type: 'state',
            common: {
                name: 'Total mower time',
                type: 'number',
                role: 'value.interval',
                read: true,
                write: false,
                unit: 'h',
                desc: 'Total distance the mower has been mowing in hours'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.waitRain', {
            type: 'state',
            common: {
                name: 'Wait after rain',
                type: 'number',
                role: 'value.interval',
                read: true,
                write: true,
                unit: 'min',
                desc: 'Time to wait after rain, in minutes'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.mowTimeExtend', {
            type: 'state',
            common: {
                name: 'Mowing times exceed',
                type: 'number',
                role: 'value',
                read: true,
                write: true,
                unit: '%',
                desc: 'Extend the mowing time'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.mower.mowerActive', {
            type: 'state',
            common: {
                name: 'Time-controlled mowing',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                unit: '%',
                desc: 'Time-controlled mowing'
            },
            native: {}
        });

        //weather
        await that.setObjectNotExistsAsync(mower.serial + '.weather.temp', {
            type: 'state',
            common: {
                name: 'temperature',
                type: 'number',
                role: 'value.temperature',
                read: true,
                write: false,
                unit: '°C',
                desc: 'actual temperature'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.icon', {
            type: 'state',
            common: {
                name: 'icon',
                type: 'string',
                role: 'weather.icon.name',
                read: true,
                write: false,
                desc: 'icon'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.main', {
            type: 'state',
            common: {
                name: 'main',
                type: 'string',
                role: 'weather.name',
                read: true,
                write: false,
                desc: 'Weather string'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.description', {
            type: 'state',
            common: {
                name: 'description',
                type: 'string',
                role: 'weather.description',
                read: true,
                write: false,
                desc: 'Weather description'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.pressure', {
            type: 'state',
            common: {
                name: 'pressure',
                type: 'number',
                role: 'value.pressure',
                read: true,
                write: false,
                desc: 'Weather pressure'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.humidity', {
            type: 'state',
            common: {
                name: 'humidity',
                type: 'string',
                role: 'value.temperature',
                read: true,
                write: false,
                unit: '%',
                desc: 'Weather humidity'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.temp_min', {
            type: 'state',
            common: {
                name: 'temp_min',
                type: 'number',
                role: 'value.temperature.min',
                read: true,
                write: false,
                unit: '°C',
                desc: 'Temperature min'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.temp_max', {
            type: 'state',
            common: {
                name: 'temp_max',
                type: 'number',
                role: 'value.temperature.max',
                read: true,
                write: false,
                unit: '°C',
                desc: 'Temperature max'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.wind_speed', {
            type: 'state',
            common: {
                name: 'wind speed ',
                type: 'number',
                role: 'value.windspeed',
                read: true,
                write: false,
                unit: 'KmH',
                desc: 'Wind Speed'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.wind_deg', {
            type: 'state',
            common: {
                name: 'wind degrees ',
                type: 'number',
                role: 'value.winddegrees',
                read: true,
                write: false,
                unit: '°',
                desc: 'Wind degrees'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.clouds', {
            type: 'state',
            common: {
                name: 'clouds',
                type: 'number',
                role: 'value.clouds',
                read: true,
                write: false,
                unit: '%',
                desc: 'Clouds'
            },
            native: {}
        });
        await that.setObjectNotExistsAsync(mower.serial + '.weather.lastUpdate', {
            type: 'state',
            common: {
                name: 'lastUpdate',
                type: 'date',
                role: 'value.date',
                read: true,
                write: false,
                desc: 'Last update on server side'
            },
            native: {}
        });
        return "ready";

    }

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info(this.name + " stopped, cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}
}

if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Worx(options);
} else {
	// otherwise start the instance directly
	new Worx();
}