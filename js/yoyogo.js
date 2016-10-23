yogo={};

yogo.log=function(msg,category,level){
	if(!window.console)return;
	var func=window.console[level];
	if(!func)func=window.console['log'];
	if(func instanceof Function){
		if(!category)category='yogo';
		try{func.call(window.console,category+':',msg);}catch(e){}
	}
};

yogo.logInfo=function(msg,category){
	yogo.log(msg,category,'info');
};

yogo.logWarn=function(msg,category){
	yogo.log(msg,category,'warn');
};

yogo.logError=function(msg,category){
	yogo.log(msg,category,'error');
};

yogo.exportFunctions=function(obj,funcNames){
	for(var i=0;i<funcNames.length;i++){
		var funcName=funcNames[i];
		var func=obj[funcName];
		if(typeof(func)!=='function'){
			yogo.logWarn(funcName+' is not a function');
			continue;
		}
		this[funcName]=func.bind(obj);
	}
};

yogo.evaluatePointRange=function(coorFrom,coorTo){
	var rangePoints=[];
	var fromX=coorFrom.x,toX=coorTo.x;
	var fromY=coorFrom.y,toY=coorTo.y;
	for(var x=fromX;x<=toX;x++){
		for(var y=fromY;y<=toY;y++){
			rangePoints.push({x:x,y:y});
		}
	}
	return rangePoints;
};