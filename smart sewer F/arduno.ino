#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

const char* ssid = "moto";
const char* password = "33333333";

String NODE_ID = "NODE_1";   // change for each device

// CHANGE THIS TO YOUR PC IP
const char* serverUrl = "http://10.27.248.177:5000/data";

#define TRIG D5
#define ECHO D6
#define TILT D7
#define BUZZER D8

void setup() {
  Serial.begin(9600);

  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(TILT, INPUT_PULLUP);
  pinMode(BUZZER, OUTPUT);

  WiFi.begin(ssid, password);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");
}

long getDistance() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long duration = pulseIn(ECHO, HIGH);
  return duration * 0.034 / 2;
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;

    int mq7 = analogRead(A0);
    delay(100);
    int mq135 = analogRead(A0);
    long water = getDistance();
    int tilt = digitalRead(TILT) == LOW ? 1 : 0;

    int safety = 100;
    if (mq7 > 600) safety -= 30;
    if (mq135 > 600) safety -= 30;
    if (water < 15) safety -= 30;

    digitalWrite(BUZZER, safety < 50 ? HIGH : LOW);

    String payload = "{";
payload += "\"node_id\":\"" + NODE_ID + "\",";
payload += "\"mq7\":" + String(mq7) + ",";
payload += "\"mq135\":" + String(mq135) + ",";
payload += "\"water_level\":" + String(water) + ",";
payload += "\"tilt\":" + String(tilt) + ",";
payload += "\"safety_score\":" + String(safety);
payload += "}";


    Serial.println(payload);

    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.POST(payload);
    http.end();
  }

  delay(3000);
}
