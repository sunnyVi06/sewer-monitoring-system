#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server details
const char* serverUrl = "http://YOUR_SERVER_IP:3000/api/data";

// Sensor pins (adjust according to your wiring)
#define MQ135_PIN A0
#define MQ7_PIN A1
#define MQ4_PIN A2
#define WATER_LEVEL_PIN A3
#define DHT_PIN D4

// Node ID
const char* nodeId = "MH-001";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // Read sensor values (simulated here – replace with actual sensor reads)
    int mq135 = analogRead(MQ135_PIN);   // H2S equivalent
    int mq7 = analogRead(MQ7_PIN);       // CO equivalent
    int mq4 = analogRead(MQ4_PIN);       // CH4 equivalent
    int waterLevel = analogRead(WATER_LEVEL_PIN); // 0-1023 → 0-100%
    float temperature = 25.0; // Replace with DHT.readTemperature()
    float humidity = 60.0;    // Replace with DHT.readHumidity()

    // Create JSON payload
    StaticJsonDocument<200> doc;
    doc["node_id"] = nodeId;
    doc["mq135"] = mq135;
    doc["mq7"] = mq7;
    doc["mq4"] = mq4;
    doc["water_level"] = map(waterLevel, 0, 1023, 0, 100);
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;

    String jsonString;
    serializeJson(doc, jsonString);

    // Send HTTP POST
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(jsonString);

    if (httpCode > 0) {
      String response = http.getString();
      Serial.println("Response: " + response);
    } else {
      Serial.println("Error on HTTP request");
    }
    http.end();
  } else {
    Serial.println("WiFi disconnected");
  }

  delay(30000); // Send data every 30 seconds
}
