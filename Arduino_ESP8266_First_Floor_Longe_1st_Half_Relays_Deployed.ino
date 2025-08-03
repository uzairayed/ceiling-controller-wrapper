#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <ESP8266WebServer.h>
#include <OneWire.h>
#include <WiFiUdp.h>

#ifndef STASSID
#define STASSID "<wifi name here>"
#define STAPSK "<wifi password here>"
#endif

#define MDNS_NAME "FirstFloorLoungeOneRelays"
#define OTA_HOST_NAME "FirstFloorLoungeOneRelays"
#define OTA_PASSWORD_HASH_MD5 "593616de15330c0fb2d55e55410bf994"  //MD5("base") = "593616de15330c0fb2d55e55410bf994"
//#define OTA_PASSWORD_HASH_MD5 "1ee80fae05cbffdf7ee5d74b92f47c0f"  //MD5("base") = "593616de15330c0fb2d55e55410bf994"

#define NO_OF_RELAY_BANKS 2   //These relay modules are almost always active low.
#define NO_OF_RELAYS_IN_A_BANK 8

uint8_t* relayValues = NULL;  //In setup()

#define SHIFT_REGISTER_OE_PIN D4    //Active LOW
#define SHIFT_REGISTER_DATA_PIN D5  //SER
#define SHIFT_REGISTER_CLOCK_PIN D7 //SRCLK
#define SHIFT_REGISTER_LATCH_PIN D6 //RCLK
#define SHIFT_REGISTER_UPDATE_MS 250

uint8_t shiftRegisterValue = 0;
uint8_t shiftRegisterBitNo = 0;
uint32_t lastShiftRegisterUpdateMillis = 0;

unsigned int localPort = 2390;                // local port to listen for UDP packets //For NTP
IPAddress timeServerIP;                       //NTP server address //Don't hardwire the IP address or we won't get the benefits of the pool. Lookup the IP address for the host name instead
const char* ntpServerName = "pool.ntp.org";
//const char* ntpServerName = "time.nist.gov";
#define NTP_PACKET_SIZE 48                    //NTP time stamp is in the first 48 bytes of the message
byte packetBuffer[NTP_PACKET_SIZE];           //Buffer to hold incoming and outgoing packets

#define STRING_CONVERSION_BUFFER_SIZE 40	//Enough for a single float, and three ints for formatting current time and uptime strings.
uint32_t currentHours = 0; uint8_t currentMinutes = 0, currentSeconds = 0;
int8_t theCurrentHour = rand() % 24;	//Must be signed, for calculations
char stringConversionBuffer[STRING_CONVERSION_BUFFER_SIZE];	//For snprintf, for converting floats and multiple ints to string

WiFiUDP udp;

#define EPOCH_OFFSET_S 18000  //Pakistani time UTC +5 
#define EPOCH_UPDATE_BY_MILLIS_INTERVAL_MS 500
uint64_t epochMS = 0;
uint32_t last_epoch_update_by_millis_millis = 0;
#define EPOCH_UPDATE_BY_NTP_INTERVAL_MS 86400000  //30000//86400000 = milliseconds in a day
uint32_t last_epoch_update_by_NTP_millis = 0;
#define NTP_REPLY_WAIT_INTERVAL_MS 1000
uint32_t last_NTP_request_sent_millis = 0;
#define NTP_TRY_AGAIN_INTERVAL_MS 10000
bool has_an_NTP_request_already_been_sent = false;
uint32_t epoch = 0;	//Current Unix time, in seconds

const char* ssid = STASSID;
const char* password = STAPSK;

ESP8266WebServer server(80);
String str;   //Reserved in setup()

void setBitInArrayLSB(uint8_t* arr, uint32_t arrSize_uint8_t, uint64_t bitNo, bool bit)	//(bitNo = 0) = LSB
{
	//Use responsibly!!!		https://stackoverflow.com/questions/47981/how-to-set-clear-and-toggle-a-single-bit

	uint64_t noOfBits = 8 * arrSize_uint8_t;
	uint64_t bitNoFromMSB = noOfBits - 1 - bitNo;	//If total bits = 32 and bitNo = 0 (= LSB), bitNoFromMSB = 31	
	uint32_t byteNoFromMSB = bitNoFromMSB / 8;
	uint8_t bitNoInTheByteFromLSB = bitNo % 8;
	
	if (true == bit)
	{
		arr[byteNoFromMSB] = arr[byteNoFromMSB] | (uint8_t) 1 << bitNoInTheByteFromLSB;
	}
	else
	{
		arr[byteNoFromMSB] = arr[byteNoFromMSB] & ~((uint8_t) 1 << bitNoInTheByteFromLSB);
	}
}

bool getBitInArrayLSB(uint8_t* arr, uint32_t arrSize_uint8_t, uint64_t bitNo)	//0 = LSB
{
	//Use responsibly!!!		https://stackoverflow.com/questions/47981/how-to-set-clear-and-toggle-a-single-bit
	
	uint64_t noOfBits = 8 * arrSize_uint8_t;
	uint64_t bitNoFromMSB = noOfBits - 1 - bitNo;	
	uint32_t byteNoFromMSB = bitNoFromMSB / 8;
	uint8_t bitNoInTheByteFromLSB = bitNo % 8;
	
	return (bool)((arr[byteNoFromMSB] >> bitNoInTheByteFromLSB) & (uint8_t) 1);	//https://stackoverflow.com/questions/9531214/access-individual-bits-in-a-char-c
}

void sendNTPpacket(IPAddress& address)  //Send an NTP request to the time server at the given address
{
  memset(packetBuffer, 0, NTP_PACKET_SIZE); // set all bytes in the buffer to 0
  // Initialize values needed to form NTP request
  // (see URL above for details on the packets)
  packetBuffer[0] = 0b11100011;  // LI, Version, Mode
  packetBuffer[1] = 0;           // Stratum, or type of clock
  packetBuffer[2] = 6;           // Polling Interval
  packetBuffer[3] = 0xEC;        // Peer Clock Precision
  // 8 bytes of zero for Root Delay & Root Dispersion
  packetBuffer[12] = 49;
  packetBuffer[13] = 0x4E;
  packetBuffer[14] = 49;
  packetBuffer[15] = 52;

  udp.beginPacket(address, 123);    //All NTP fields have been given values, now you can send a packet requesting a timestamp// NTP requests are to port 123
  udp.write(packetBuffer, NTP_PACKET_SIZE);
  udp.endPacket();
}

void updateShiftRegisters()
{
  if (millis() - lastShiftRegisterUpdateMillis >= SHIFT_REGISTER_UPDATE_MS)
  {
    lastShiftRegisterUpdateMillis = millis();

    digitalWrite(SHIFT_REGISTER_LATCH_PIN, LOW);
    
    for (int i = 0; i < NO_OF_RELAY_BANKS; i++)
    {
      shiftOut(SHIFT_REGISTER_DATA_PIN, SHIFT_REGISTER_CLOCK_PIN, MSBFIRST, relayValues[i]);  //https://forum.arduino.cc/t/msbfirst-and-lsbfirst-on-shift-register/1100980
    }

    //shiftOut(SHIFT_REGISTER_DATA_PIN, SHIFT_REGISTER_CLOCK_PIN, LSBFIRST, shiftRegisterValue);
    //shiftOut(SHIFT_REGISTER_DATA_PIN, SHIFT_REGISTER_CLOCK_PIN, LSBFIRST, 255);
    digitalWrite(SHIFT_REGISTER_LATCH_PIN, HIGH);

    digitalWrite(SHIFT_REGISTER_OE_PIN, LOW);
    
    // bitSet(shiftRegisterValue, shiftRegisterBitNo);
    // shiftRegisterBitNo++;
    
    // //Serial.println((int)shiftRegisterValue);

    // if (8 < shiftRegisterBitNo)
    // {
    //   shiftRegisterValue = shiftRegisterBitNo = 0;
    // }
  }
}

void updateTime()
{
  if (millis() - last_epoch_update_by_NTP_millis >= EPOCH_UPDATE_BY_NTP_INTERVAL_MS)  //Update Epoch by NTP.
  {
    if (has_an_NTP_request_already_been_sent)
    {
      int cb = udp.parsePacket();
      if (cb ||  millis() - last_NTP_request_sent_millis >= NTP_REPLY_WAIT_INTERVAL_MS)  //If a reply has been received or enough time has passed
      {
        if (cb) //Packet received
        {
          last_epoch_update_by_NTP_millis = millis();
          last_epoch_update_by_millis_millis = last_epoch_update_by_NTP_millis;
          has_an_NTP_request_already_been_sent = false;

          udp.read(packetBuffer, NTP_PACKET_SIZE);  //Read the packet into the buffer
          unsigned long highWord = word(packetBuffer[40], packetBuffer[41]);// the timestamp starts at byte 40 of the received packet and is four bytes, or two words, long. First, esxtract the two words:
          unsigned long lowWord = word(packetBuffer[42], packetBuffer[43]);
          unsigned long secsSince1900 = highWord << 16 | lowWord; //Combine the four bytes (two words) into a long integer, this is NTP time (seconds since Jan 1 1900):
          const unsigned long seventyYears = 2208988800UL;  //Unix time starts on Jan 1 1970. In seconds, that's 2208988800:
          epoch = secsSince1900 - seventyYears; //Subtract seventy years:
          epochMS = (uint64_t)epoch * (uint64_t)1000;

          // Serial.print("Epoch = "); Serial.println(epoch);
          // Serial.print("H = "); Serial.println(currentHours);
          // Serial.print("M = "); Serial.println(currentMinutes);
          // Serial.print("S = "); Serial.println(currentSeconds);
          // String s(epochMS);
          // Serial.print("Epoch ms = "); Serial.println(s);
        }
        else  //Packet not received, try again, but not immediately, to be polite.
        {
          if (millis() - last_NTP_request_sent_millis >= NTP_TRY_AGAIN_INTERVAL_MS) //If it has been a while since last request
          {
            WiFi.hostByName(ntpServerName, timeServerIP); //Get a random server from the pool
            sendNTPpacket(timeServerIP);  //Send an NTP packet to a time server
            last_NTP_request_sent_millis = millis();
          }
        }
      }
    }
    else  //No NTP request has been sent. Send one now.
    {
      WiFi.hostByName(ntpServerName, timeServerIP); //Get a random server from the pool
      sendNTPpacket(timeServerIP);  //Send an NTP packet to a time server
      last_NTP_request_sent_millis = millis();
      has_an_NTP_request_already_been_sent = true;
    }
  }

  if (millis() - last_epoch_update_by_millis_millis >= EPOCH_UPDATE_BY_MILLIS_INTERVAL_MS)  //Update epoch by millis
  {
    epochMS = epochMS + (millis() - last_epoch_update_by_millis_millis);
    last_epoch_update_by_millis_millis = millis();
    epoch = epochMS / (uint64_t)1000;
  }

  currentSeconds = (epoch + EPOCH_OFFSET_S) % 60;
  currentMinutes = (((epoch + EPOCH_OFFSET_S) / 60)     ) % 60;
  currentHours   = (((epoch + EPOCH_OFFSET_S) / 60) / 60) % 24;
}

void setupTime()
{    
  while (epoch <= 60) //Try to get NTP time for 60 seconds.
  {
    if (has_an_NTP_request_already_been_sent)
    {
      int cb = udp.parsePacket();
      if (cb ||  millis() - last_NTP_request_sent_millis >= NTP_REPLY_WAIT_INTERVAL_MS)  //If a reply has been received or enough time has passed
      {
        if (cb) //Packet received
        {
          last_epoch_update_by_NTP_millis = millis();
          last_epoch_update_by_millis_millis = last_epoch_update_by_NTP_millis;
          has_an_NTP_request_already_been_sent = false;

          udp.read(packetBuffer, NTP_PACKET_SIZE);  //Read the packet into the buffer
          unsigned long highWord = word(packetBuffer[40], packetBuffer[41]);// the timestamp starts at byte 40 of the received packet and is four bytes, or two words, long. First, esxtract the two words:
          unsigned long lowWord = word(packetBuffer[42], packetBuffer[43]);
          unsigned long secsSince1900 = highWord << 16 | lowWord; //Combine the four bytes (two words) into a long integer, this is NTP time (seconds since Jan 1 1900):
          const unsigned long seventyYears = 2208988800UL;  //Unix time starts on Jan 1 1970. In seconds, that's 2208988800:
          epoch = secsSince1900 - seventyYears; //Subtract seventy years:
          epochMS = (uint64_t)epoch * (uint64_t)1000;
        }
        else  //Packet not received, try again, but not immediately, to be polite.
        {
          if (millis() - last_NTP_request_sent_millis >= NTP_TRY_AGAIN_INTERVAL_MS) //If it has been a while since last request
          {
            WiFi.hostByName(ntpServerName, timeServerIP); //Get a random server from the pool
            sendNTPpacket(timeServerIP);  //Send an NTP packet to a time server
            last_NTP_request_sent_millis = millis();
          }
        }
      }
    }
    else  //No NTP request has been sent. Send one now.
    {
      WiFi.hostByName(ntpServerName, timeServerIP); //Get a random server from the pool
      sendNTPpacket(timeServerIP);  //Send an NTP packet to a time server
      last_NTP_request_sent_millis = millis();
      has_an_NTP_request_already_been_sent = true;
    } 
  }

  currentSeconds = (epoch + EPOCH_OFFSET_S) % 60;
  currentMinutes = (((epoch + EPOCH_OFFSET_S) / 60)     ) % 60;
  currentHours   = (((epoch + EPOCH_OFFSET_S) / 60) / 60) % 24;  
}

void handleRoot()
{
  str.clear();

	str += "<!DOCTYPE html> <html>";
	str += "<head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, user-scalable=no\">";
	str += "<title>First Floor Lounge (One) Relays</title>";
	str += "<style>";
	str += "html {font-family: Helvetica; display: inline-block; margin: 0px auto; text-align: center;}";
	str += "body{background-color:#000; margin-top: 50px;} h1 {color: #ec1c24;margin: 50px auto 30px;} h3 {color: #ec1c24;margin-bottom: 50px;}";
	str += ".button {display: block;width: 80px;background-color: #ec1c24;border: 2px solid #ec1c24;color:#000;padding: 13px 30px;text-decoration: none;font-size: 25px;margin: 0px auto 35px;cursor: pointer;border-radius: 4px;}";
	str += ".button-on:active {background-color: #ec1c24; color: #000;}";
	str += ".button-off {background-color: #000; color: #ec1c24;}";
	str += ".button-off:active {background-color: #ec1c24; color: #000;}";
	str += "h2{color:#ec1c24;}";
	//str += "th,td {border: 2px, border-style:solid, border-color: #ec1c24, border-collapse: collapse, text-align: left;} table.center {margin-left: auto; margin-right: auto; }";
	//str += "th, td {border-style:solid; border-color: #ec1c24;}table.center {margin-left: auto; margin-right: auto; }";
	str += "table,th,td{color:#ec1c24;}th,td{padding:5px;}table.center{margin-left:auto;margin-right:auto;}";
	str += "</style>";
	str += "</head>";
	str += "<body>\n";
	
  //Serial.println((int)relayValues[0]);

  for (int i = 0; i < NO_OF_RELAY_BANKS * NO_OF_RELAYS_IN_A_BANK; i++)
	{
		str += "<a class=\"button ";
		str += (getBitInArrayLSB(relayValues, NO_OF_RELAY_BANKS, i) == false) ? "button-on\"" : "button-off\""; //Active low code
    //str += (i + 1 == fanSpeed) ? "button-on\"" : "button-off\"";
		str += "href=\"/" + String(i) + "\">" + String(i) + "</a>\n";
    //str += "href=\"/SetSpeed" + String(i + 1) + "\">" + String(i + 1) + "</a>\n";
  }

		uint8_t theHour = currentHours % 24;
		bool isAM = false;
		
		if (theHour < 12)
		{
			isAM = true;
		}
		theHour %= 12;
		if (0 == theHour)
		{
			theHour = 12;
		}

  snprintf(stringConversionBuffer, STRING_CONVERSION_BUFFER_SIZE, "<h1>%02d:%02d:%02d ", theHour, currentMinutes, currentSeconds);	//Pakistan standard time, UTC +5.
	str += stringConversionBuffer;
  str += (isAM) ? "am" : "pm";
  str += "</h1>\n";
	snprintf(stringConversionBuffer, STRING_CONVERSION_BUFFER_SIZE, "<h2>Uptime: %02d:%02d:%02d</h2>\n", ((millis() / 1000) / 60) / 60, ((millis() / 1000) / 60) % 60, (millis() / 1000) % 60);
	str += stringConversionBuffer;
  
  str += "<h2>" + String(epoch) + "</h2>\n";

	str += "</body>\n";
	str += "</html>\n";

  server.send(200, "text/html", str);
}

void handleNotFound()
{
  str.clear();
  str = server.uri();   //Eg: "/17"
  str.remove(0, 1);        //Remove '/' from "/l7".
  int channelNo = str.toInt();  //https://www.arduino.cc/reference/en/language/variables/data-types/string/functions/toint/
  if (channelNo >= 0 && channelNo < NO_OF_RELAY_BANKS * NO_OF_RELAYS_IN_A_BANK)
  {
    setBitInArrayLSB(relayValues, NO_OF_RELAY_BANKS, channelNo, !getBitInArrayLSB(relayValues, NO_OF_RELAY_BANKS, channelNo));
  
    server.sendHeader("Location", String("/"), true); //https://www.esp8266.com/viewtopic.php?p=48063
    server.send ( 302, "text/plain", "");

//    Serial.print(relayValues[0], BIN);
//    Serial.println(relayValues[1], BIN);
  }

  else
  {
    String message = "File Not Found\n\n";
    message += "URI: ";
    message += server.uri();
    message += "\nMethod: ";
    message += (server.method() == HTTP_GET) ? "GET" : "POST";
    message += "\nArguments: ";
    message += server.args();
    message += "\n";

    for (uint8_t i = 0; i < server.args(); i++) 
    {
      message += " " + server.argName(i) + ": " + server.arg(i) + "\n";
    }

    server.send(404, "text/plain", message);
  }


}

void setup()
{
  str.reserve(9000);  //For handleRoot()

  relayValues = new uint8_t[NO_OF_RELAY_BANKS];
  for (int i = 0; i < NO_OF_RELAY_BANKS; i++)
  {
    relayValues[i] = 255; //Active low relays. Write high to turn them all off initially. 
  }

  //delete[] relayValues;
  //relayValues = NULL;
  
  pinMode(SHIFT_REGISTER_DATA_PIN, OUTPUT);
  pinMode(SHIFT_REGISTER_CLOCK_PIN, OUTPUT);  
  pinMode(SHIFT_REGISTER_LATCH_PIN, OUTPUT);
  pinMode(SHIFT_REGISTER_OE_PIN, OUTPUT);
  updateShiftRegisters();   //Actually write them all off.
  digitalWrite(SHIFT_REGISTER_OE_PIN, LOW);

  udp.begin(localPort); //For NTP
  
  Serial.begin(115200);
  Serial.println("Booting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.waitForConnectResult() != WL_CONNECTED)
  {
    //Serial.println("Connection Failed! Rebooting...");
    delay(500);
    //Serial.print(".");
  }

  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  // Port defaults to 8266
  // ArduinoOTA.setPort(8266);

  // Hostname defaults to esp8266-[ChipID]
  // ArduinoOTA.setHostname("myesp8266");
  ArduinoOTA.setHostname(OTA_HOST_NAME);

  // No authentication by default
  // ArduinoOTA.setPassword("admin");

  // Password can be set with it's md5 value as well
  // MD5(admin) = 21232f297a57a5a743894a0e4a801fc3
  //MD5("base") = "593616de15330c0fb2d55e55410bf994"; 
  // ArduinoOTA.setPasswordHash("21232f297a57a5a743894a0e4a801fc3");
  ArduinoOTA.setPasswordHash(OTA_PASSWORD_HASH_MD5);

  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {  // U_FS
      type = "filesystem";
    }

    // NOTE: if updating FS this would be the place to unmount FS using FS.end()
    //Serial.println("Start updating " + type);
  });
  ArduinoOTA.onEnd([]() {
    //Serial.println("\nEnd");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    //Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });

  // ArduinoOTA.onError([](ota_error_t error)
  // {
  //   Serial.printf("Error[%u]: ", error);
  //   if (error == OTA_AUTH_ERROR) {
  //     Serial.println("Auth Failed");
  //   } else if (error == OTA_BEGIN_ERROR) {
  //     Serial.println("Begin Failed");
  //   } else if (error == OTA_CONNECT_ERROR) {
  //     Serial.println("Connect Failed");
  //   } else if (error == OTA_RECEIVE_ERROR) {
  //     Serial.println("Receive Failed");
  //   } else if (error == OTA_END_ERROR) {
  //     Serial.println("End Failed");
  //   }
  // });
  
  ArduinoOTA.begin();
  //Serial.println("Ready");
  //Serial.print("IP address: ");
  //Serial.println(WiFi.localIP());

	if (MDNS.begin(MDNS_NAME))
	{
		//Serial.println("MDNS responder started");
	}

	server.on("/", handleRoot);
	server.onNotFound(handleNotFound);
  server.begin();
  
  setupTime();
}

void loop()
{
  ArduinoOTA.handle();
  server.handleClient();
  MDNS.update();
  updateTime();
  updateShiftRegisters();
}
