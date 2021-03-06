(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var yogo=require("../util");


class NodeTraverser {

	traverseNodes(nodeCallback, variationCallback,
			variationCompleteCallback) {

		var nodes = this.nodes;
		for (var ni = 0; ni < nodes.length; ni++) {
			var node = nodes[ni];
			if (nodeCallback) {
				var ncr = nodeCallback.call(node, node);
				if (ncr === false) {
					return;
				}
			}
			var variations = node.variations;
			if (!variations) {
				continue;
			}
			for (var vi = 0; vi < variations.length; vi++) {
				var variation = variations[vi];
				if (variationCallback) {
					var vcr = variationCallback.call(variation, variation);
					if (vcr === false) {
						return;
					}
				}
				variation.traverseNodes(nodeCallback, variationCallback,
						variationCompleteCallback);
				if (variationCompleteCallback) {
					var vcr = variationCompleteCallback.call(variation,
							variation);
					if (vcr === false) {
						return;
					}
				}
			}
		}

		return;
	}

	selectNodes(predicate) {
		var nodes = [];
		this.traverseNodes(function(node) {
			if (predicate.call(node, node)) {
				nodes.push(node);
			}
		});
		return nodes;
	}

	findNode(predicate) {
		var found = [];
		this.traverseNodes(function(node) {
			var result = predicate.call(node, node);
			if (result === null) {
				return false;
			}
			if (result === true) {
				found.push(node);
				return false;
			}
		});

		return found[0] || null;
	}
}


class GameModel extends NodeTraverser {
	constructor(){
		super();
		this.realGame = true;
		this.boardSize = null;
		this.nodes = [];
		this.gameInfo = {};

		this.nodeMap = {};
		this.nodesByMoveNumber = [];
		this.pointMovesMatrix = [];

		this.gameEndingNode = null;
	}


	static newModel(boardSize, handicapPoints) {

		var gameModel = new GameModel();
		gameModel.boardSize = boardSize;
		for (var x = 0; x < gameModel.boardSize; x++) {
			gameModel.pointMovesMatrix[x] = [];
		}

		var firstNode = new Node(null, gameModel);
		gameModel.indexNode(firstNode);
		gameModel.nodes[0] = firstNode;
		gameModel.gameEndingNode = firstNode;

		if (handicapPoints && handicapPoints.length > 0) {
			var gameInfo = gameModel.gameInfo;
			gameInfo.rule = {};
			gameInfo.rule['HA'] = handicapPoints.length;
			firstNode.setup = {
				'AB' : handicapPoints
			};
		}

		return gameModel;
	}

	indexNode(node) {
		this.nodeMap[node.id] = node;
		var realGame = node.belongingVariation.realGame;
		if (realGame) {
			var point = node.move.point;
			if (point) {
				var pointMovesX = this.pointMovesMatrix[point.x];
				var pointMoves = pointMovesX[point.y];
				if (pointMoves) {
					pointMoves.push(node);
				} else {
					pointMoves = [ node ];
					pointMovesX[point.y] = pointMoves;
				}
			}
			if (node.move.color) {
				var mn = node.move.variationMoveNumber;
				this.nodesByMoveNumber[mn] = node;
			}
		}
	}

	unindexNode(node) {
		this.nodeMap[node.id] = null;
		var realGame = node.belongingVariation.realGame;
		if (realGame) {
			var point = node.move.point;
			if (point) {
				var pointMovesX = this.pointMovesMatrix[point.x];
				var pointMoves = pointMovesX[point.y];
				if (pointMoves) {
					var index = pointMoves.indexOf(node);
					if (index >= 0) {
						pointMoves.splice(index, 1);
					}
				}
			}
			if (node.move.color) {
				var mn = node.move.variationMoveNumber;
				this.nodesByMoveNumber[mn] = null;
			}
		}
	}

}



class Variation extends NodeTraverser {

	constructor(baseNode, parentVariation) {
		super();
		this.baseNode = baseNode;
		this.parentVariation = parentVariation;
		this.realGame = false;
		this.nodes = [];
		this.index = 0;
		this.id = 'v' + yogo.nextuid();
	}

	nextVariation() {
		var variations = this.baseNode.variations;
		var nextVindex = (this.index + 1) % variations.length;
		if (nextVindex == 0) {
			nextVindex = 1;
		}
		return variations[nextVindex];
	}

	previousVariation() {
		var variations = this.baseNode.variations;
		var nextVindex = (this.index - 1 + variations.length)
				% variations.length;
		if (nextVindex == 0) {
			nextVindex = variations.length - 1;
		}
		return variations[nextVindex];
	}

	realGameBaseNode() {
		var variation = this;
		while (variation && !variation.realGame) {
			if (variation.parentVariation.realGame) {
				return variation.baseNode;
			}
			variation = variation.parentVariation;
		}
	}
}

class Node {
	constructor(previousNode, belongingVariation) {
		this.previousNode = previousNode;
		this.belongingVariation = belongingVariation;
		this.nextNode = null;
		this.props = {};
		this.basic = {};
		this.move = {};
		this.status = {};
		this.id = 'n' + yogo.nextuid();
		this.position = null;

		if (!previousNode) {
			this.setMoveNumber();
		}
	}

	isVariationFirstNode() {
		var pn = this.previousNode;
		return !pn || pn.belongingVariation !== this.belongingVariation;
	}

	isVariationLastNode() {
		return !this.nextNode && !this.variations;
	}

	isGameBegining() {
		var pn = this.previousNode;
		var v = this.belongingVariation;
		// !pn && v.realGame && !v.parentVariation
		return (!pn && v instanceof GameModel);
	}

	isSetup() {
		return !!this.setup;
	}

	hasComment() {
		return !!(this.basic && this.basic['C']);
	}

	hasMarks() {
		return !!this.marks;
	}

	hasRemark() {
		return !!this.remark;
	}

	findNodeInAncestors(predicate) {
		var node = this;
		while (true) {
			node = node.previousNode;
			if (!node) {
				return null;
			}
			var result = predicate.call(node, node);
			if (result === null) {
				return null;
			}
			if (result === true) {
				return node;
			}
		}
	}

	findNodeInMainline(predicate) {
		var node = this;
		while (true) {
			if (node.nextNode) {
				node = node.nextNode;
			} else if (node.variations) {
				node = node.variations[0].nodes[0];
			} else {
				return null;
			}
			var result = predicate.call(node, node);
			if (result === null) {
				return null;
			}
			if (result === true) {
				return node;
			}
		}
	}

	findNodeInSuccessors(predicate) {
		var node = this;
		while (true) {
			if (node.nextNode) {
				node = node.nextNode;
			} else if (node.variations) {
				for (var vi = 0; vi < node.variations.length; vi++) {
					var variation = node.variations[vi];
					var foundNode = variation.findNode(predicate);
					if (foundNode) {
						return foundNode;
					}
				}
			} else {
				return null;
			}
			var result = predicate.call(node, node);
			if (result === null) {
				return null;
			}
			if (result === true) {
				return node;
			}
		}
	}

	traverseSuccessorNodes(nodeCallback, variationCallback) {
		var node = this;
		while (true) {
			if (node.nextNode) {
				node = node.nextNode;
			} else if (node.variations) {
				for (var vi = 0; vi < node.variations.length; vi++) {
					var variation = node.variations[vi];
					if (variationCallback) {
						var vcr = variationCallback.call(variation, variation,
								null);
						if (vcr === false) {
							return false;
						}
					}
					var goon = variation.traverseNodes(nodeCallback,
							variationCallback);
					if (goon === false) {
						return false;
					}
				}
			} else {
				return true;
			}
			var goon = nodeCallback.call(node, node);
			if (goon === false) {
				return false;
			}
		}
	}

	nextNodeAt(coor) {
		var nextNode = this.nextNode;
		if (nextNode && nextNode.move.point) {
			var point = nextNode.move.point;
			if (coor.x === point.x && coor.y === point.y) {
				return nextNode;
			}
			return null;
		}
		if (this.branchPoints) {
			for (var i = 0; i < this.branchPoints.length; i++) {
				var point = this.branchPoints[i];
				if (coor.x === point.x && coor.y === point.y) {
					var variation = this.variations[i];
					return variation.nodes[0];
				}
			}
		}
		return null;
	}

	nextPass(color) {
		var nextNode = this.nextNode;
		if (nextNode && nextNode.status.pass) {
			if (nextNode.move.color == color) {
				return nextNode;
			}
			return null;
		}
		if (this.variations) {
			for (var i = 0; i < this.variations.length; i++) {
				var variation = this.variations[i];
				var node0 = variation.nodes[0];
				if (node0.status.pass && node0.move.color == color) {
					return node0;
				}
			}
		}
		return null;
	}

	nextMoveColor() {
		var color;
		if (this.move['PL']) {
			color = this.move['PL'];
		} else if (this.move.color) {
			color = (this.move.color === 'B') ? 'W' : 'B';
		} else if (this.isGameBegining()) {
			var v = this.belongingVariation;
			// v is GameModel
			if (v.gameInfo.rule && v.gameInfo.rule['HA']) {
				color = 'W';
			}
		}
		if (!color) {
			color = 'B';
		}
		return color;
	}

	setMoveNumber() {
		var playOrPass = this.status.move || this.status.pass;
		var mns;
		if (this.previousNode) {
			var lastMove = this.previousNode.move;
			mns = [ lastMove.displayMoveNumber + (playOrPass ? 1 : 0),
					lastMove.variationMoveNumber + (playOrPass ? 1 : 0) ];
		} else {
			mns = playOrPass ? [ 1, 1 ] : [ 0, 0 ];
		}

		this.move.displayMoveNumber = mns[0];
		this.move.variationMoveNumber = mns[1];

		var thisVariation = this.belongingVariation;
		var realGame = thisVariation.realGame;
		if (this.isVariationFirstNode() && !realGame && thisVariation.index > 0) {
			this.move.displayMoveNumber = playOrPass ? 1 : 0;
			this.move.variationMoveNumber = playOrPass ? 1 : 0;
		}

		if (this.move['MN']) {
			this.move.displayMoveNumber = this.move['MN'];
		}
	}

	resetMoveNumber() {
		this.setMoveNumber();
		var thisVariation = this.belongingVariation;
		var vcb = function(variation) {
			if (variation !== thisVariation && variation.index > 0) {
				return false;
			}
		};
		var ncb = function(node) {
			node.setMoveNumber();
		};
		this.traverseSuccessorNodes(ncb, vcb);
	}

	setBranchPoints() {
		if (!this.variations) {
			return;
		}
		var variations = this.variations;
		var branchPoints = [];
		for (var i = 0; i < variations.length; i++) {
			var variation = variations[i];
			variation.index = i;
			var node0 = variation.nodes[0];
			if (node0.status.move) {
				var coordinate = node0.move.point;
				branchPoints.push(coordinate);
			} else {
				branchPoints.push({
					x : 52,
					y : 52
				});
			}
		}
		this.branchPoints = branchPoints;
	}

	diffPosition(fromNode) {
		var fromPosition = fromNode.position;
		var toPosition = this.position;
		var stonesToRemove = [];
		var stonesToAddW = [];
		var stonesToAddB = [];
		var boardSize = fromPosition.length;
		for (var x = 0; x < boardSize; x++) {
			var fx = fromPosition[x];
			var tx = toPosition[x];
			if (fx === tx) {
				continue;
			}
			for (var y = 0; y < boardSize; y++) {
				var fromStatus = fx[y];
				var toStatus = tx[y];
				if (fromStatus === toStatus || (!fromStatus && !toStatus)) {
					continue;
				}
				var toRemove = false, toAdd = false;
				if (!toStatus) {
					toRemove = true;
				} else if (!fromStatus) {
					toAdd = true;
				} else if (fromStatus.color != toStatus.color) {
					toRemove = true;
					toAdd = true;
				}
				var point = {
					x : x,
					y : y
				};
				if (toRemove) {
					stonesToRemove.push(point);
				}
				if (toAdd) {
					if (toStatus.color == 'B') {
						stonesToAddB.push(point);
					} else {
						stonesToAddW.push(point);
					}
				}
			}
		}
		return {
			stonesToRemove : stonesToRemove,
			stonesToAddB : stonesToAddB,
			stonesToAddW : stonesToAddW
		};
	}
}

module.exports={GameModel,Variation,Node};

},{"../util":3}],2:[function(require,module,exports){
var {GameModel,Variation,Node}=require("./model");
var yogo=require("../util");

class SgfParser {

	constructor() {

		let gameInfoGroupToNames = {
			root : 'GM FF AP SZ CA ST',
			basic : 'GN EV RO DT PC RE GC',
			rule : 'HA KM RU TM OT',
			blackPlayer : 'PB BR BS BT',
			whitePlayer : 'PW WR WS WT',
			recorder : 'US SO AP',
			misc : 'CP ON AN'
		};

		let nodeGroupToPropNames = {
			basic : 'N C',
			setup : 'AB AW AE',
			move : 'B W BL WL PL MN OB OW KO FG V',
			remark : 'GB GW UC DM TE BM DO IT HO',
			marks : 'LB TR CR SQ MA SL TW TB AR LN',
			inheritProps : 'PM DD DW'
		};

		let typeToPropNames = {
			integer : 'MN OB OW PM SZ HA ST',
			'float' : 'V KM',
			bool : 'DO IT KO',
			triple : 'GB GW UC DM TE BM HO',
			point : 'B W',
			lableList : 'LB',
			pointList : 'AB AW AE TR CR SQ MA SL AR LN TW TB DD VM',
			stringArray : ''
		};

		function reverseMap(map) {
			var reversed = {};
			for (let groupName in map) {
				let names = map[groupName].split(' ');
				for (let i = 0; i < names.length; i++) {
					reversed[names[i]] = groupName;
				}
			}
			return reversed;
		}

		this.gameInfoPropNameToGroup = reverseMap(gameInfoGroupToNames);
		this.nodePropNameToGroup = reverseMap(nodeGroupToPropNames);
		this.propNameToType = reverseMap(typeToPropNames);
	}


	parseSgf(sgfText) {
		// P=()[];\
		// /[P]|[^P]*/g
		var tokenPatt = /[()\[\];\\]|[^()\[\];\\]*/g;

		var gameCollection = [];
		var tokenState = null;// inProp,inPropValue

		var curGameModel;
		var curVariation;
		var curNode;
		var curPropName;
		var curPropValues;
		var curVariationDepth = 0;

		var tokens = sgfText.match(tokenPatt);
		var tokenBuffer = '';

		function finishPropertyIfAny() {
			if (curPropName) {
				curNode.props[curPropName] = curPropValues;
				curPropName = null;
				curPropValues = null;
			}
		}

		for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
			var token = tokens[tokenIndex];

			if (token == '\\') {
				if (tokenState == 'inPropValue') {
					token = tokens[++tokenIndex];
					if (token.startsWith('\n')) {
						token = token.substr(1);
					}
					tokenBuffer += token;
				} else {
					yogo.logError('unexpected token: \\', 'parse sgf');
				}
				continue;
			}

			if (tokenState == 'inPropValue') {
				if (token != ']') {
					tokenBuffer += token;
					continue;
				}
			}

			if (token == '(') {
				if (curVariationDepth == 0) {
					curGameModel = new GameModel();
					gameCollection.push(curGameModel);
					curVariation = curGameModel;
				} else {
					finishPropertyIfAny();
					var parentVariation = curVariation;
					curVariation = new Variation(curNode, parentVariation);
					var realGame = parentVariation.realGame
							&& !curNode.variations;
					if (realGame) {
						curVariation.realGame = true;
						curNode.variations = [];
					} else {
						curVariation.realGame = false;
						if (!curNode.variations) {
							curNode.variations = [];
						}
					}
					curVariation.index = curNode.variations.length;
					curNode.variations.push(curVariation);
				}
				tokenBuffer = '';
				tokenState = null;
				curVariation.variationDepth = curVariationDepth;
				curVariationDepth++;
			} else if (token == ')') {
				finishPropertyIfAny();
				tokenBuffer = '';
				curVariationDepth--;
				if (curVariationDepth < 0) {
					yogo.logError('dismatch parenthesis: )', 'parse sgf')
					continue;
				}
				curNode = curVariation.baseNode;
				if (curVariation.nodes.length == 0) {
					yogo.logWarn('empty variation!', 'parse sgf')
					curNode.variations.pop();
				}
				curVariation = curVariation.parentVariation;
				tokenState = null;
			} else if (token == ';') {
				finishPropertyIfAny();
				tokenBuffer = '';
				var previousNode = curNode;
				curNode = new Node(previousNode, curVariation);
				if (previousNode
						&& previousNode.belongingVariation === curVariation) {
					previousNode.nextNode = curNode;
				}
				curVariation.nodes.push(curNode);
				tokenState = 'inProp';
			} else if (token == '[') {
				tokenState = 'inPropValue';
			} else if (token == ']') {
				if (curPropName != 'C') {
					tokenBuffer = tokenBuffer.trim();
				}
				if (!curPropValues) {
					curPropValues = tokenBuffer
				} else if (curPropValues instanceof Array) {
					curPropValues.push(tokenBuffer);
				} else {
					curPropValues = [ curPropValues, tokenBuffer ];
				}
				tokenBuffer = '';
				tokenState = 'inProp';
			} else {
				if (tokenState == 'inProp') {
					tokenBuffer += token;
					tokenBuffer = tokenBuffer.trim();
					if (tokenBuffer == '') {
						continue;
					}
					if (/[a-zA-Z0-9]+/.test(tokenBuffer)) {
						finishPropertyIfAny();
						curPropName = tokenBuffer;
						tokenBuffer = '';
					} else {
						yogo.logError('unexpected property name: '
								+ tokenBuffer, 'parse sgf')
					}
				} else {
					tokenBuffer += token;
				}
			}
		}

		return gameCollection;
	}

	buildGoGameModel(gameCollection) {

		for (var gtIndex = 0; gtIndex < gameCollection.length; gtIndex++) {
			var gameModel = gameCollection[gtIndex];
			this.processGameInfo(gameModel);

			for (var x = 0; x < gameModel.boardSize; x++) {
				gameModel.pointMovesMatrix[x] = [];
			}

			var parser = this;

			var nodeCallback = function(node) {

				var props = node.props;
				for (let name in props) {
					var group = parser.nodePropNameToGroup[name];
					if (!group) {
						if (parser.gameInfoPropNameToGroup[name]) {
							if (node.previousNode) {
								yogo.logWarn(
										'game info not at the first node: '
												+ name, 'node');
							}
						} else {
							yogo.logWarn('unknown property name: ' + name,
									'node');
						}
						continue;
					}
					var propValue = props[name];
					var type = parser.propNameToType[name];
					propValue = parser.propertyTypeConvert(propValue, type,
							gameModel.boardSize);

					if (!node[group]) {
						node[group] = {};
					}
					node[group][name] = propValue;
				}

				if (node.move['W'] && node.move['B']) {
					yogo.logWarn('both Black and White move in one node: B['
							+ node.props['B'] + '],W[' + node.props['W'] + ']',
							'node');
				}

				node.status.move = !!(node.move['W'] || node.move['B']);
				node.status.pass = node.move['W'] === null
						|| node.move === null;

				if (node.status.move) {
					var point = (node.move['W'] || node.move['B']);
					node.move.point = point;
					node.move.color = (node.move['B']) ? 'B' : 'W';
				}else if(node.status.pass){
					node.move.color = (node.move['B'] === null) ? 'B' : 'W';
				}

				if (node.isVariationLastNode()) {
					var realGame = node.belongingVariation.realGame;
					if (realGame) {
						gameModel.gameEndingNode = node;
					}
				}

			};

			gameModel.traverseNodes(nodeCallback);

			var nodeCallback2 = function(node) {

				node.setMoveNumber();

				node.setBranchPoints();

				gameModel.indexNode(node);
			};

			gameModel.traverseNodes(nodeCallback2);
		}
	}

	processGameInfo(gameModel) {

		if (!gameModel.gameInfo) {
			gameModel.gameInfo = {};
		}
		var gameInfo = gameModel.gameInfo;

		var gameInfoNode = gameModel.nodes[0];
		var props = gameInfoNode.props;
		if (props['GM'] && props['GM'] !== '1') {
			yogo.logError('unsupported game type: GM=' + props['GM'],
					'game info');
		}
		if (!props['SZ']) {
			yogo.logError('missing board size(SZ)', 'game info');
		}

		for (let name in props) {
			var group = this.gameInfoPropNameToGroup[name];
			if (!group) {
				if (!(this.nodePropNameToGroup && this.nodePropNameToGroup[name])) {
					yogo.logWarn('unknown property name: ' + name, 'game info');
				}
				continue;
			}
			if (!gameInfo[group])
				gameInfo[group] = {};
			var value = props[name];
			if (this.propNameToType[name]) {
				value = this.propertyTypeConvert(value,
						this.propNameToType[name], gameModel.boardSize);
			}
			gameInfo[group][name] = value;
		}

		function changePropName(obj, names) {
			for (var i = 0; i < names.length; i++) {
				var name = names[i];
				var oriName = name[0], newName = name[1];
				obj[newName] = obj[oriName];
				delete obj[oriName];
			}
		}

		if (gameInfo.blackPlayer) {
			changePropName(gameInfo.blackPlayer, [ [ 'PB', 'name' ],
					[ 'BR', 'rank' ], [ 'BS', 'species' ], [ 'BT', 'term' ] ]);
		}
		if (gameInfo.whitePlayer) {
			changePropName(gameInfo.whitePlayer, [ [ 'PW', 'name' ],
					[ 'WR', 'rank' ], [ 'WS', 'species' ], [ 'WT', 'term' ] ]);
		}

		var boardSize = gameInfo.root['SZ'];
		if (isNaN(boardSize) || boardSize < 5 || boardSize > 51) {
			yogo.logError('wrong board size(SZ)', 'game info');
		}

		gameModel.boardSize = boardSize;
	}

	parseCoordinate(sgfPoint, boardSize) {
		if (!sgfPoint.match(/^[a-z][a-z]$/i)) {
			yogo.logWarn('wrong coordinate: ' + sgfPoint, 'node');
			return null;
		}
		var x = sgfPoint.charCodeAt(0);
		var y = sgfPoint.charCodeAt(1);
		if (x < 97) {
			x = 26 + x - 65;
		} else {
			x -= 97;
		}
		if (y < 97) {
			y = 26 + y - 65;
		} else {
			y -= 97;
		}
		if (x >= boardSize || y >= boardSize) {
			return null;
		}

		return {
			x : x,
			y : y
		};
	}

	propertyTypeConvert(propValue, type, boardSize) {

		var oriValue = propValue;
		if (type) {
			if ([ 'lableList', 'pointList', 'stringArray' ].indexOf(type) >= 0) {
				if (!(propValue instanceof Array)) {
					propValue = [ propValue ];
				}
			} else {
				if (propValue instanceof Array) {
					propValue = propValue[0] || '';
				}
			}

			if (type == 'point') {
				if (propValue == '') {
					propValue = null;
				} else {
					propValue = this.parseCoordinate(propValue, boardSize);
				}
			} else if (type == 'lableList') {
				var coordinates = [];
				for (var pi = 0; pi < propValue.length; pi++) {
					var coorStrAndLabel = propValue[pi].split(':');
					var coorStr = coorStrAndLabel[0];
					var label = coorStrAndLabel[1];
					if (!label)
						continue;
					var coor = this.parseCoordinate(coorStr, boardSize);
					if (coor != null) {
						coor.label = label;
						coordinates.push(coor);
					}
				}
				propValue = coordinates.length > 0 ? coordinates : null;
			} else if (type == 'pointList') {
				var coordinates = [];
				for (var pi = 0; pi < propValue.length; pi++) {
					var coorStr = propValue[pi];
					if (coorStr.indexOf(':') > 0) {
						var coorStrPair = coorStr.split(':');
						var coorFrom = this.parseCoordinate(coorStrPair[0],
								boardSize);
						var coorTo = this.parseCoordinate(coorStrPair[1],
								boardSize);
						if (coorFrom && coorTo) {
							var coorRange = {
								coorFrom : coorFrom,
								coorTo : coorTo
							};
							coordinates.push(coorRange);
						}
					} else {
						var coor = this.parseCoordinate(coorStr, boardSize);
						if (coor != null) {
							coordinates.push(coor);
						}
					}
				}
				propValue = coordinates.length > 0 ? coordinates : null;
			} else if (type == 'triple') {
				propValue = (propValue == '2') ? 2 : 1;
			} else if (type == 'bool') {
				propValue = true;
			} else if (type == 'integer') {
				propValue = parseInt(propValue);
				if (isNaN(propValue)) {
					yogo.logWarn("can't parse to Integer: " + name + ','
							+ oriValue, 'node');
				}
			} else if (type == 'float') {
				propValue = parseFloat(propValue);
				if (isNaN(propValue)) {
					yogo.logWarn("can't parse to Float: " + name + ','
							+ oriValue, 'node');
				}
			} else {
				yogo.logWarn('to do: ' + name, 'node');
			}
		}

		return propValue;
	}


	static parse(sgfText) {
		var sgfParser = new SgfParser();
		var gameCollection = sgfParser.parseSgf(sgfText);
		sgfParser.buildGoGameModel(gameCollection);
		return gameCollection;
	}


	static parseGameModel0(sgfText) {
		let gameCollection=SgfParser.parse(sgfText);
		return gameCollection[0];
	}
}


module.exports=SgfParser
},{"../util":3,"./model":1}],3:[function(require,module,exports){
var yogo = {
	_uid : 1024,
	nextuid : function() {
		yogo._uid++;
		return yogo._uid;
	},

	log : function(msg, category, level) {
		var func = console[level];
		if (!func)
			func = console['log'];
		if (func instanceof Function) {
			if (!category)
				category = 'yogo';
			try {
				func.call(console, category + ':', msg);
			} catch (e) {
			}
		}
	},

	logInfo : function(msg, category) {
		yogo.log(msg, category, 'info');
	},

	logWarn : function(msg, category) {
		yogo.log(msg, category, 'warn');
	},

	logError : function(msg, category) {
		yogo.log(msg, category, 'error');
	},

	exportFunctions : function(obj, funcNames) {
		for (var i = 0; i < funcNames.length; i++) {
			var funcName = funcNames[i];
			var func = obj[funcName];
			if (typeof (func) !== 'function') {
				yogo.logWarn(funcName + ' is not a function');
				continue;
			}
			this[funcName] = func.bind(obj);
		}
	},

	evaluatePointRange : function(coorFrom, coorTo) {
		var rangePoints = [];
		var fromX = coorFrom.x, toX = coorTo.x;
		var fromY = coorFrom.y, toY = coorTo.y;
		for (var x = fromX; x <= toX; x++) {
			for (var y = fromY; y <= toY; y++) {
				rangePoints.push({
					x : x,
					y : y
				});
			}
		}
		return rangePoints;
	},

	findPoint : function(coorArray, coor) {
		for (var i = 0; i < coorArray.length; i++) {
			var c = coorArray[i];
			if (c.x === coor.x && c.y === coor.y) {
				return i;
			}
		}
		return -1;
	},

	removePoint : function(coorArray, coor) {
		if (!coorArray) {
			return false;
		}
		var index = yogo.findPoint(coorArray, coor);
		if (index >= 0) {
			coorArray.splice(index, 1);
			return true;
		}
		return false;
	}

};

module.exports=yogo;

},{}]},{},[2]);
