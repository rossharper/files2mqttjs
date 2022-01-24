#!/bin/bash

read -p 'MQTT Broker Address: ' broker_address
read -p 'MQTT Broker Username: ' user
read -sp 'MQTT Broker Password: ' pass
echo
read -p 'Sensor Paths: ' sensor_paths
echo

pm2 start index.js --name files2mqtt -l ~/homecontrol/logs/files2mqtt -- $broker_address -username $user -password $pass $sensor_paths
pm2 save
