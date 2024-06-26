import React, { useState, useEffect } from 'react';
import { View, Text, Button, PermissionsAndroid, Platform, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';

const BLEManager = new BleManager();

const DEVICE_NAME = "MyESP32"; // Replace with your ESP32 device name
const SERVICE_UUID = "00001234-0000-1000-8000-00805F9B34FB"; // Replace with your service UUID
const TEMPERATURE_CHARACTERISTIC_UUID = "00005678-0000-1000-8000-00805F9B34FB"; // Replace with your temperature characteristic UUID
const HUMIDITY_CHARACTERISTIC_UUID = "00005679-0000-1000-8000-00805F9B34FB"; // Replace with your humidity characteristic UUID

const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      if (
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] !== PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] !== PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED
      ) {
        console.warn('Some permissions were not granted');
      }
    } catch (err) {
      console.warn(err);
    }
  } else {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      alert("Permission to access location was denied");
      return;
    }
  }
};

const enableBluetooth = async () => {
  try {
    const state = await BLEManager.state();
    if (state !== 'PoweredOn') {
      console.warn('Bluetooth is not enabled. Please enable Bluetooth.');
    } else {
      console.log('Bluetooth is enabled');
    }
  } catch (error) {
    console.error('Error checking Bluetooth state:', error);
  }
};

const App = () => {
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [temperature, setTemperature] = useState(null);
  const [humidity, setHumidity] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [timestamp, setTimestamp] = useState("");
  const [location, setLocation] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);

  useEffect(() => {
    requestPermissions().catch(error => console.error('Error requesting permissions:', error));
    enableBluetooth().catch(error => console.error('Error enabling Bluetooth:', error));

    return () => {
      BLEManager.destroy();
    };
  }, []);

  const showTemporaryAlert = (message) => {
    setAlertMessage(message);
    setTimeout(() => setAlertMessage(null), 2000);
  };

  const scanAndConnect = () => {
    console.log('Starting scan...');
    showTemporaryAlert('Starting scan...');
    setIsScanning(true);
    BLEManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Error during scan:', error);
        showTemporaryAlert(`Error during scan: ${error.message}`);
        setIsScanning(false);
        return;
      }

      if (device.name) {
        console.log(`Found device: ${device.name}`);
        showTemporaryAlert(`Found device: ${device.name}`);
      } else {
        console.log('Found device with no name');
        showTemporaryAlert('Found device with no name');
      }

      if (device.name === DEVICE_NAME) {
        console.log('Found target device, stopping scan...');
        showTemporaryAlert('Found target device, stopping scan...');
        BLEManager.stopDeviceScan();
        connectToDevice(device).catch(error => {
          console.error('Error connecting to device:', error);
          showTemporaryAlert(`Error connecting to device: ${error.message}`);
        });
      }
    });
  };

  const connectToDevice = async (device) => {
    try {
      console.log('Connecting to device...');
      showTemporaryAlert('Connecting to device...');
      const connectedDevice = await device.connect();
      setConnectedDevice(connectedDevice);

      console.log('Discovering services and characteristics...');
      showTemporaryAlert('Discovering services and characteristics...');
      await connectedDevice.discoverAllServicesAndCharacteristics();
    } catch (error) {
      console.error('Error connecting to device:', error);
      showTemporaryAlert(`Error connecting to device: ${error.message}`);
    }
  };

  const readDataFromDevice = async (device) => {
    try {
      console.log('Reading data from device...');
      showTemporaryAlert('Reading data from device...');
      const temperatureCharacteristic = await device.readCharacteristicForService(SERVICE_UUID, TEMPERATURE_CHARACTERISTIC_UUID);
      const humidityCharacteristic = await device.readCharacteristicForService(SERVICE_UUID, HUMIDITY_CHARACTERISTIC_UUID);

      const temperatureBuffer = Buffer.from(temperatureCharacteristic.value, 'base64');
      const humidityBuffer = Buffer.from(humidityCharacteristic.value, 'base64');

      const temperature = parseFloat(temperatureBuffer.toString('utf8'));
      const humidity = parseFloat(humidityBuffer.toString('utf8'));

      setTemperature(temperature);
      setHumidity(humidity);

      let timestamp = new Date().toISOString();
      setTimestamp(timestamp);

      // Get the current GPS coordinates
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);

      let csvData = `"${timestamp}","${location.coords.latitude}","${location.coords.longitude}","${temperature}","${humidity}"\n`;
      let path = FileSystem.documentDirectory + "data.csv";

      FileSystem.getInfoAsync(path)
        .then(({ exists }) => {
          if (exists) {
            FileSystem.readAsStringAsync(path, {
              encoding: FileSystem.EncodingType.UTF8,
            })
              .then((existingData) => {
                let newData = existingData + csvData;
                FileSystem.writeAsStringAsync(path, newData, {
                  encoding: FileSystem.EncodingType.UTF8,
                })
                  .then(() => {
                    console.log("Data appended!");
                    showTemporaryAlert("Data appended!");
                  })
                  .catch((err) => {
                    console.log(err.message);
                    showTemporaryAlert(err.message);
                  });
              })
              .catch((err) => {
                console.log(err.message);
                showTemporaryAlert(err.message);
              });
          } else {
            FileSystem.writeAsStringAsync(path, csvData, {
              encoding: FileSystem.EncodingType.UTF8,
            })
              .then(() => {
                console.log("File created and data written!");
                showTemporaryAlert("File created and data written!");
              })
              .catch((err) => {
                console.log(err.message);
                showTemporaryAlert(err.message);
              });
          }
        })
        .catch((err) => {
          console.log(err.message);
          showTemporaryAlert(err.message);
        });
    } catch (error) {
      console.error('Error reading data from device:', error);
      showTemporaryAlert(`Error reading data from device: ${error.message}`);
    }
  };

  const takeData = async () => {
    if (connectedDevice) {
      readDataFromDevice(connectedDevice).catch(error => {
        console.error('Error reading data from device:', error);
        showTemporaryAlert(`Error reading data from device: ${error.message}`);
      });
    } else {
      Alert.alert('Device not connected', 'Please scan and connect to a device first.');
    }
  };

  const shareFile = async () => {
    let path = FileSystem.documentDirectory + "data.csv";
    await Sharing.shareAsync(path);
  };

  const clearFile = async () => {
    let path = FileSystem.documentDirectory + "data.csv";
    await FileSystem.writeAsStringAsync(path, "", {
      encoding: FileSystem.EncodingType.UTF8,
    });
    console.log("File cleared!");
    showTemporaryAlert("File cleared!");
  };

  const confirmClearFile = () => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to clear the data file?",
      [
        {
          text: "Cancel",
          onPress: () => console.log("Clear file cancelled"),
          style: "cancel"
        },
        { text: "OK", onPress: clearFile }
      ],
      { cancelable: false }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BLE Temperature and Humidity Monitor</Text>
      {alertMessage && (
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>{alertMessage}</Text>
        </View>
      )}
      {connectedDevice ? (
        <View>
          <Text style={styles.text}>Temperature: {temperature !== null ? `${temperature} °C` : 'N/A'}</Text>
          <Text style={styles.text}>Humidity: {humidity !== null ? `${humidity} %` : 'N/A'}</Text>
          <Text style={styles.text}>Timestamp: {timestamp}</Text>
          {location && (
            <Text style={styles.text}>
              Location: {`${location.coords.latitude}, ${location.coords.longitude}`}
            </Text>
          )}
          <TouchableOpacity style={styles.databutton} onPress={takeData}>
            <Text style={styles.databuttonText}>Take Data</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.otherbuttons} onPress={shareFile}>
            <Text style={styles.otherbuttonsText}>Share File</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.otherbuttons} onPress={confirmClearFile}>
            <Text style={styles.otherbuttonsText}>Clear Data File</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Button title={isScanning ? "Scanning..." : "Scan for Devices"} onPress={scanAndConnect} disabled={isScanning} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBox: {
    padding: 10,
    backgroundColor: 'yellow',
    marginBottom: 10,
    borderRadius: 5,
  },
  alertText: {
    fontSize: 16,
    color: 'black',
  },
  databutton: {
    marginBottom: 20,
	 marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'blue', // Example background color
    borderRadius: 5,
  },
  databuttonText: {
    fontSize: 30,
    color: 'yellow',
  },
  otherbuttons: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'green', // Example background color
    borderRadius: 5,
  },
  otherbuttonsText: {
    fontSize: 20,
    color: 'white',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  text: {
    fontSize: 18,
    marginVertical: 10,
  },
});

export default App;
