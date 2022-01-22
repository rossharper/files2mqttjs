'use strict'

const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const log = console.log.bind(console)
const mqtt = require('mqtt')

const temperatureSensorDataFilename = 'value'
const batterySensorDataFilename = 'batt'

function usage () {
    console.log('Usage: ')
    console.log('  node index.js <BROKER_ADDRESS> [-user <BROKER_USERNAME>] [-pass <BROKER_PASSWORD>] dir1 [dirN ...]')
    console.log('  npm start -- <BROKER_ADDRESS> [-user <BROKER_USERNAME>] [-pass <BROKER_PASSWORD>] dir1 [dirN ...]')
    process.exit()
}

function parseArgs () {
    let argi = 1

    const args = {
        mqttBrokerAddr: readArgValue(),
        watchPaths: []
    }

    function hasArg (arg) {
        return process.argv[argi] === arg
    }

    function readArgValue () {
        return process.argv[++argi] || usage()
    }

    for (argi++; argi < process.argv.length; argi++) {
        if (hasArg('-username')) {
            args.username = readArgValue()
        } else if (hasArg('-password')) {
            args.password = readArgValue()
        } else {
            args.watchPaths.push(process.argv[argi])
        }
    }

    return args
}

function watchSensorData (watchPaths, onSensorData) {
    function readSensorData (devicePath) {
        const device = path.basename(devicePath)
        const tempDataPath = path.join(devicePath, temperatureSensorDataFilename)
        const battDataPath = path.join(devicePath, batterySensorDataFilename)
        fs.readFile(tempDataPath, 'utf8', (err, tempData) => {
            if (err) {
                console.error(err)
                return
            }
            const temperature = parseFloat(tempData)
            if (isNaN(temperature)) {
                console.error(`Temperature from ${tempDataPath} is NaN`)
            }
            fs.readFile(battDataPath, 'utf8', (err, battData) => {
                if (err) {
                    console.error(err)
                    return
                }
                const batteryVoltage = parseFloat(battData)
                if (isNaN(batteryVoltage)) {
                    console.error(`Battery Voltage from ${battDataPath} is NaN`)
                }
                onSensorData({
                    device: device,
                    data: {
                        temperature: temperature,
                        battery_voltage: batteryVoltage
                    }
                })
            })
        })
    }

    function fileUpdated (updatedPath) {
        log(`File udpate: ${updatedPath}`)
        const devicePath = path.dirname(updatedPath)
        readSensorData(devicePath)
    }

    function onInitialStates () {
        watchPaths.forEach(readSensorData)
    }

    const watcher = chokidar.watch(watchPaths)
    watcher
        .on('change', fileUpdated)
        .on('ready', onInitialStates)
}

function sendConfigurationMessages (client, watchPaths) {
    watchPaths.forEach(watchPath => {
        const device = path.basename(watchPath)
        log(`Send configuration messages for ${device}`)

        const tempTopic = `home/sensor/${device}temp/config`
        const tempConfigPayload = {
            object_id: `${device}_temperature`,
            name: `${device} Temperature`,
            device_class: 'temperature',
            state_topic: `home/sensor/${device}/state`,
            unit_of_measurement: '°C',
            value_template: '{{ value_json.temperature }}'
        }
        sendMessage(client, tempTopic, tempConfigPayload, { retain: true })

        const battTopic = `home/sensor/${device}batt/config`
        const battConfigPayload = {
            object_id: `${device}_battery`,
            name: `${device} Battery`,
            device_class: 'battery',
            state_topic: `home/sensor/${device}/state`,
            unit_of_measurement: '%',
            value_template: '{{ ((min([value_json.battery_voltage-2.0,1.0]))*100) | round(2) }}'
        }
        sendMessage(client, battTopic, battConfigPayload, { retain: true })
    })
}

function sendSensorDataState (client, sensorData) {
    const topic = `home/sensor/${sensorData.device}/state`
    const message = sensorData.data
    sendMessage(client, topic, message)
}

function sendMessage (client, topic, payload, options) {
    log(`Publishing to topic: ${topic}`)
    log(payload)
    client.publish(topic, JSON.stringify(payload), options)
}

function run (args) {
    const client = mqtt.connect(`mqtt://${args.mqttBrokerAddr}`, { username: args.username, password: args.password })
    client.on('connect', function () {
        sendConfigurationMessages(client, args.watchPaths)
        watchSensorData(args.watchPaths, sensorData => {
            sendSensorDataState(client, sensorData)
        })
    })
    process.on('exit', () => { client.end() })
    process.on('SIGINT', () => {
        client.end()
        process.exit()
    })
}

run(parseArgs())
