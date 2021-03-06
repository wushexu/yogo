let util=require("../util");
let {GameModel,Variation,Node}=require("./model");

class SgfParser {

	constructor() {

		const gameInfoGroupToNames = {
			root : 'GM FF AP SZ CA ST',
			basic : 'GN EV RO DT PC RE GC',
			rule : 'HA KM RU TM OT',
			blackPlayer : 'PB BR BS BT',
			whitePlayer : 'PW WR WS WT',
			recorder : 'US SO AP',
			misc : 'CP ON AN'
		};

		const nodeGroupToPropNames = {
			basic : 'N C',
			setup : 'AB AW AE',
			move : 'B W BL WL PL MN OB OW KO FG V',
			remark : 'GB GW UC DM TE BM DO IT HO',
			marks : 'LB TR CR SQ MA SL TW TB AR LN',
			inheritProps : 'PM DD DW'
		};

		const typeToPropNames = {
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

		for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
			var token = tokens[tokenIndex];

			if (token == '\\') {
				if (tokenState == 'inPropValue') {
					token = tokens[++tokenIndex];
					if (token.startsWith('\n')) {
						token = token.substr(1);
					}
					tokenBuffer += token;
				} else {
					util.logError('unexpected token: \\', 'parse sgf');
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
					util.logError('dismatch parenthesis: )', 'parse sgf')
					continue;
				}
				curNode = curVariation.baseNode;
				if (curVariation.nodes.length == 0) {
					util.logWarn('empty variation!', 'parse sgf')
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
						util.logError('unexpected property name: '
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

		for (let gtIndex = 0; gtIndex < gameCollection.length; gtIndex++) {
			var gameModel = gameCollection[gtIndex];
			this.processGameInfo(gameModel);

			for (let x = 0; x < gameModel.boardSize; x++) {
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
								util.logWarn(
										'game info not at the first node: '
												+ name, 'node');
							}
						} else {
							util.logWarn('unknown property name: ' + name,
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
					util.logWarn('both Black and White move in one node: B['
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
			util.logError('unsupported game type: GM=' + props['GM'],
					'game info');
		}
		if (!props['SZ']) {
			util.logError('missing board size(SZ)', 'game info');
		}

		for (let name in props) {
			var group = this.gameInfoPropNameToGroup[name];
			if (!group) {
				if (!(this.nodePropNameToGroup && this.nodePropNameToGroup[name])) {
					util.logWarn('unknown property name: ' + name, 'game info');
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
			for (let i = 0; i < names.length; i++) {
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
			util.logError('wrong board size(SZ)', 'game info');
		}

		gameModel.boardSize = boardSize;
	}

	parseCoordinate(sgfPoint, boardSize) {
		if (!sgfPoint.match(/^[a-z][a-z]$/i)) {
			util.logWarn('wrong coordinate: ' + sgfPoint, 'node');
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
				for (let pi = 0; pi < propValue.length; pi++) {
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
				for (let pi = 0; pi < propValue.length; pi++) {
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
					util.logWarn("can't parse to Integer: " + name + ','
							+ oriValue, 'node');
				}
			} else if (type == 'float') {
				propValue = parseFloat(propValue);
				if (isNaN(propValue)) {
					util.logWarn("can't parse to Float: " + name + ','
							+ oriValue, 'node');
				}
			} else {
				util.logWarn('to do: ' + name, 'node');
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


module.exports=SgfParser;
