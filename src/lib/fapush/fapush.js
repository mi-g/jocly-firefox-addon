/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Cc, Ci } = require("chrome");
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const self = require('sdk/self');
const timers = require("sdk/timers");

const wss = Cc["@mozilla.org/network/protocol;1?name=wss"];
const prefService=Cc["@mozilla.org/preferences-service;1"]
	.getService(Ci.nsIPrefService);
const prefBranch=prefService.getBranch("extensions."+self.id+".");

const { generateUUID } = Cc['@mozilla.org/uuid-generator;1'].
	getService(Ci.nsIUUIDGenerator);

var wssChan = null;
var wssUrl = null;
var options = null;
var timerRetry = null;
var timerPing = null;
var timerPong = null;
var connected = false;
var running = false;
var registerRequests = {};
var unregisterRequests = {};
var pendingRegisters = {};
var pendingUnregisters = {};

var listener = {
	onAcknowledge: function(aContext,aSize) {},
	onBinaryMessageAvailable: function(aContext, aMsg) {
		//console.info("FAPush:onBinaryMessageAvailable",aMsg);		
		HandlePing();
	},
	onMessageAvailable: function(aContext, aMsg) {
		//console.info("FAPush:onMessageAvailable",aMsg);
		HandlePing();
		try {
			var msg=JSON.parse(aMsg);
			switch(msg.messageType) {
			case "hello":
				if(msg.status==200) {
					connected = true;
					if(options.uaid.length>0 && options.uaid!=msg.uaid) {
						AbortRegistrations();
						SaveRegistrations({});
						timers.setTimeout(function() {
							try {
								options.onmessage('push-register',{});								
							} catch(e) {}
						},0);
					}
					options.uaid = msg.uaid;
					prefBranch.setCharPref("pushServer",options.serverUrl+"|"+options.uaid);
					for(var channel in pendingRegisters) {
						registerRequests[channel] = pendingRegisters[channel]; 
						delete pendingRegisters[channel];
						SendRegister(channel);
					}
					for(var channel in pendingUnregisters) {
						unregisterRequests[channel] = pendingUnregisters[channel]; 
						delete pendingUnregisters[channel];
						SendUnregister(channel);
					}
				} else
					SetRetryTimer();
				break;
			case "register":
				var request = registerRequests[msg.channelID];
				if(request) {
					if(msg.status==200) {
						var registrations = GetRegistrations();
						registrations[msg.channelID] = {
							e: msg.pushEndpoint,
							v: 0,
						}
						SaveRegistrations(registrations);
						try {
							request.onsuccess({
								target: {
									result: msg.pushEndpoint
								}
							});
						} catch(e) {}
					} else {
						request.error={
							name: "AbortError",
							description: msg.error
						}
						try {
							request.onerror(request.error);
						} catch(e) {}
					}
				}
				break;
			case "notification":
				var registrations = GetRegistrations();
				var saveRegistrations = false;
				msg.updates.forEach(function(update) {
					var registration = registrations[update.channelID];
					if(registration) {
						if(update.version>registration.v) {
							saveRegistrations=true;
							registration.v = update.version; 
							try {
								options.onmessage('push',{
									pushEndpoint: registration.e,
									version: update.version,
								});
							} catch(e) {}
						}
					}
				});
				if(saveRegistrations)
					SaveRegistrations(registrations);
				break;
			case "unregister":
				var request = unregisterRequests[msg.channelID];
				if(request) {
					delete pendingUnregisters[msg.channelID];
					delete unregisterRequests[msg.channelID];
					delete pendingRegisters[msg.channelID];
					var registrations = GetRegistrations();
					delete pendingUnregisters[msg.channelID];
					if(msg.status==200) {
						delete registrations[msg.channelID];
						SaveRegistrations(registrations);
						try {
							request.onsuccess({
								target: {
									result: request.result
								}
							});
						} catch(e) {}
					} else {
						request.error={
							name: "AbortError",
							description: msg.error
						}
						try{
							request.onerror(request.error);
						} catch(e) {}
					}
				}
				break;
			}
		} catch(e) {
			console.warn("onMessageAvailable error:",e,e.stack);
		}
	},
	onServerClose: function(aContext, aCode, aReason) {},
	onStart: function(aContext) {
		var channelIDs = [];
		var registrations = GetRegistrations();
		for(var channelID in registrations)
			channelIDs.push(registrations[channelID]);
		var helloMsg = JSON.stringify({
		   messageType: "hello",
		   uaid: options.uaid,
		   channelIDs: channelIDs
		});
		wssChan.sendMsg(helloMsg);
	},
	onStop: function(aContext, aStatusCode) {
		connected = false;
		wssChan = null;
		SetTimerRetry();
	}
}

function HandlePing() {
	if(options.usePing) {
		ClearTimerPong();
		SetTimerPing(function() {
			wssChan.sendMsg("{}");
			SetTimerPong(function() {
				if(wssChan)
					wssChan.close(1000,"No answer to ping");
				connected = false;
			});
		});
	}	
}

function GetRegistrations() {
	var registrations = {};
	try {
		registrations = JSON.parse(prefBranch.getCharPref("pushRegistrations"));
	} catch(e) {}
	return registrations;
}

function SaveRegistrations(registrations) {
	prefBranch.setCharPref("pushRegistrations",JSON.stringify(registrations));
}

function Start() {
	if(!running)
		return;
	var uri = ioService.newURI(options.serverUrl, null, null);
	wssChan = wss.createInstance(Ci.nsIWebSocketChannel);
	wssChan.asyncOpen(uri, "", listener, null);	
}

function SendRegister(channelID) {
	var regMsg = JSON.stringify({
		messageType: "register",
		channelID: channelID
	});
	wssChan.sendMsg(regMsg);
}

function SendUnregister(channelID) {
	var unregMsg = JSON.stringify({
		messageType: "unregister",
		channelID: channelID
	});
	wssChan.sendMsg(unregMsg);
}

function ClearTimerRetry() {
	if(timerRetry) {
		timers.clearTimeout(timerRetry);
		timerRetry = null;
	}
}

function SetTimerRetry() {
	ClearTimerRetry();
	timerRetry = timers.setTimeout(Start,options.retryTimeout);
}

function ClearTimerPing() {
	if(timerPing) {
		timers.clearTimeout(timerPing);
		timerPing = null;
	}
}

function SetTimerPing(callback) {
	ClearTimerPing();
	timerPing = timers.setTimeout(callback,options.pingTimeout);
}

function ClearTimerPong() {
	if(timerPong) {
		timers.clearTimeout(timerPong);
		timerPong = null;
	}
}

function SetTimerPong(callback) {
	ClearTimerPong();
	timerPong = timers.setTimeout(callback,options.pongTimeout);
}

function AbortRegistrations() {
	function AbortPool(pool) {
		for(var channelID in pool) {
			var request = pool[channelID];
			request.error={
				name: "AbortError",
			}
			try {
				request.onerror(request.error);
			} catch(e) {}
		}
	}
	AbortPool(registerRequests);
	registerRequests = {};
	AbortPool(unregisterRequests);
	unregisterRequests = {};
	AbortPool(pendingRegisters);
	pendingRegisters = {};
	AbortPool(pendingUnregisters);
	pendingUnregisters = {};
}

exports.init = function(opts) {
	if(!prefBranch.prefHasUserValue("pushServer")) {
		prefBranch.setCharPref("pushServer","wss://push.services.mozilla.com|");
		prefBranch.setCharPref("pushRegistrations","{}");
	}
	
	opts=opts || {};
	
	options = {
		serverUrl: "wss://push.services.mozilla.com",
		uaid: "",
		usePing: true,
		retryTimeout: 10*1000,
		pingTimeout: 30*60*1000,
		pongTimeout: 10*1000,
		onmessage: function() {}
	}
	
	var prefPushServer = prefBranch.getCharPref("pushServer");
	var m=/^(.*)(?:\|)(.*)$/.exec(prefPushServer);
	if(m) {
		if(m[1])
			options.serverUrl = m[1];
		options.uaid = m[2] || "";
	}
	for(var f in opts) 
		if(opts.hasOwnProperty(f))
			options[f] = opts[f];
	running = true;
	Start();
}

exports.destroy = function() {
	running = false;
	ClearTimerRetry();
	ClearTimerPing();
	ClearTimerPong();
	AbortRegistrations();
	if(wssChan) {
		wssChan.close(1000,"Closed");
		wssChan = null;
	}
}

exports.register = function() {
	var channelID =  generateUUID().toString().replace(/\{|\}/g,'');
	var request = {
		onsuccess: function() {},
		onerror: function() {},
	}
	registerRequests[channelID] = request;
	if(connected)
		SendRegister(channelID);
	else
		pendingRegisters[channelID] = request;
	return request;
}

exports.unregister = function(endpoint) {
	var registrations = GetRegistrations();
	var registration = null, channelID = null;
	for(var cid in registrations)
		if(registrations[cid].e==endpoint) {
			channelID = cid;
			registration = registrations[cid]; 
		}
	var request = {
		onsuccess: function() {},
		onerror: function() {},
	}
	if(registration) {
		request.result = {
			pushEndpoint: endpoint,
			version: registration.v,
		}
		unregisterRequests[channelID] = request;
		if(connected)
			SendUnregister(channelID);
		else
			pendingUnregisters[channelID] = request;
	} else {
		request.error={
			name: "NotFoundError",
		}
		timers.setTimeout(function() {
			request.onerror(request.error);
		},0);		
	}
	return request;
}

exports.registrations = function() {
	var registrations=[];
	var regs=GetRegistrations();
	for(var channelID in regs)
		registrations.push({
			pushEndpoint: regs[channelID].e,
			version: regs[channelID].v,
		});
	var request={
		onsuccess: function() {},
		onerror: function() {},
		result: registrations,
	}
	timers.setTimeout(function() {
		request.onsuccess({
			target: {
				result: registrations
			}
		});
	},0);
	return request;
}
