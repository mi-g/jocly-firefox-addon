/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

angular.module('JoclyAddon', []).controller('AppScope', 
	['$scope',function($scope) {
		self.port.on("contentMessage",function(message) {
			switch(message.type) {
			case "set": 
				$scope[message.name] = message.value;
				break;
			case "multiset":
				message.data.forEach(function(entry) {
					$scope[entry.name] = entry.value;
				});
			}
			$scope.$apply();
		});
		$scope.selectGame = function(gameName) {
			self.postMessage({
				type: "selectGame",
				game: gameName
			});
		}
		$scope.selectTable = function(table) {
			self.postMessage({
				type: "selectTable",
				table: table,
			});
		}
		$scope.selected={
			groupName: 'all',
		};
		$scope.$watch('groups',function(groups) {
			$scope.groupsMap={};
			if(groups)
				groups.forEach(function(group) {
					$scope.groupsMap[group.name]=group;
				});
		});
		$scope.filterGamesCurrentGroup = function(game) {
			var group = $scope.groupsMap[$scope.selected.groupName];
			return group.games.indexOf(game.name)>=0;
		}
		$scope.login = function() {
			self.postMessage({
				type: "login",
			});			
		}
		$scope.logout = function() {
			self.postMessage({
				type: "logout",
			});			
		}
		$scope.forget = function() {
			self.postMessage({
				type: "forget",
			});			
		}
	}]
);

angular.module('JoclyAddon').directive('joclyTimer', 
		[  '$rootScope','$window', '$timeout',
		  function factory($rootScope,$window,$timeout) {
		return {
			scope: {},
			template: "{{value}}",
			link: function(scope,element,attrs) {
				element.addClass("hidden");
				var timer=null;
				var unwatchHandler=null;
				function TimeToText(value) {
					value=Math.floor(value/1000);
					var days=Math.floor(value/86400);
					value%=86400;
					var hours=Math.floor(value/3600);
					value%=3600;
					var minutes=Math.floor(value/60);
					var seconds=value%60;
					var str="";
					if(days>0)
						str+=days+"d";
						//str+=$rootScope.t("d",{'@days':days})+" ";
					if(days>0 || hours>0)
						str+=hours+":";
					if(days==0 && hours==0 && minutes==0)
						str+="0";
					else if(minutes<10)
						str+="0"+minutes;
					else
						str+=minutes;
					str+=":";
					if(seconds<10)
						str+="0"+seconds;
					else
						str+=seconds;
					return str;
				}
				var t0=Date.now();
				var data={
					min: 0,
					max: Infinity,
					mode: 'empty',
					time: 0,
					short: false,
					show: true,
					delta: 0,
					display: true,
				}
				function UpdateText(time) {
					var oldValue=scope.value;
					switch(data.mode) {
					case "static":
						time=data.time;
						break;
					case "countdown":
						time=-time;
						break;
					case "forward":
						time=time+data.delta;
						break;
					}
					data.time=time;
					if(data.mode=="empty" || data.display==false)
						scope.value="";
					else
						scope.value=TimeToText(Math.max(data.min,Math.min(data.max,time)));
					if(scope.value!=oldValue && !$rootScope.$$phase)
						scope.$digest();
					if(timer && 
						((data.mode=="countdown" && time<=data.min) || 
							(data.mode=="forward" && time>=data.max))) {
						$window.clearInterval(timer);
						timer=null;
						$timeout(function() {
							self.postMessage({
								type: "checkHots",
							});							
						},1000);
					}
				}
				function Interval() {
					var ms=Date.now();
					var time=ms-t0;
					UpdateText(time);
				}
				scope.update=function(d) {
					if(timer) {
						$window.clearInterval(timer);
						timer=null;
					}
					if(d.model) {
						if(unwatchHandler)
							unwatchHandler();
						var expr="("+d.model+")";
						unwatchHandler=scope.$parent.$watch(expr,function(value) {
							var time=scope.$parent.$eval(d.model);
							if((d.mode || data.mode)=='countdown')
								time+=-Date.now();
							scope.update({
								run:true,
								mode:data.mode,
								time:time,
							});
						});
					}
					if(d.run!==undefined) {
						if(d.mode=="countdown") {
							t0=Date.now()+(d.time || 0);
							data.run=true;
						} else if(d.mode=="forward") {
							t0=Date.now();
							data.run=true;
						}
					}
					for(var f in d)
						if(d.hasOwnProperty(f))
							data[f] = d[f];
					if(data.show)
						element.removeClass("hidden");
					else
						element.addClass("hidden");
					if((data.mode=="countdown" || data.mode=="forward") && data.run)
						timer=$window.setInterval(Interval,333);
					Interval();
					if(d.run===false) {
						data.delta=data.time;
					} else if(d.run===undefined)
						data.delta=0;
				}
				scope.update(scope.$eval(attrs.joclyTimer || "{}"));
				scope.$on("$destroy",function() {
					if(timer)
						$window.clearInterval(timer);				
					if(unwatchHandler)
						unwatchHandler();
				});
			},
		};
	} ]);

angular.module('JoclyAddon').filter('toArray', function() { return function(obj) {
    if (!(obj instanceof Object)) return obj;
    var arr=[];
    for(var key in obj)
    	arr.push(Object.defineProperty(obj[key], '$key', {__proto__: null, value: key}));
    return arr;
}});
