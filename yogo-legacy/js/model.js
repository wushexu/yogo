function GameModel() {
	this.realGame = true;
	this.boardSize = null;
	this.nodes = [];
	this.gameInfo = {};

	this.nodeMap = {};
	this.nodesByMoveNumber = [];
	this.pointMovesMatrix = [];

	this.gameEndingNode = null;
}

GameModel.newModel = function(boardSize, handicapPoints) {

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

GameModel.prototype = {

	indexNode : function(node) {
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
	},

	unindexNode : function(node) {
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
	},

	traverseNodes : function(nodeCallback, variationCallback,
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
	},

	selectNodes : function(predicate) {
		var nodes = [];
		this.traverseNodes(function(node) {
			if (predicate.call(node, node)) {
				nodes.push(node);
			}
		});
		return nodes;
	},

	findNode : function(predicate) {
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
};

function Variation(baseNode, parentVariation) {
	this.baseNode = baseNode;
	this.parentVariation = parentVariation;
	this.realGame = false;
	this.nodes = [];
	this.index = 0;
	this.id = 'v' + yogo.nextuid();
}

Variation.prototype = {
	nextVariation : function() {
		var variations = this.baseNode.variations;
		var nextVindex = (this.index + 1) % variations.length;
		if (nextVindex == 0) {
			nextVindex = 1;
		}
		return variations[nextVindex];
	},

	previousVariation : function() {
		var variations = this.baseNode.variations;
		var nextVindex = (this.index - 1 + variations.length)
				% variations.length;
		if (nextVindex == 0) {
			nextVindex = variations.length - 1;
		}
		return variations[nextVindex];
	},

	realGameBaseNode : function() {
		var variation = this;
		while (variation && !variation.realGame) {
			if (variation.parentVariation.realGame) {
				return variation.baseNode;
			}
			variation = variation.parentVariation;
		}
	}

};

Variation.prototype.traverseNodes = GameModel.prototype.traverseNodes;
Variation.prototype.selectNodes = GameModel.prototype.selectNodes;
Variation.prototype.findNode = GameModel.prototype.findNode;

function Node(previousNode, belongingVariation) {
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

Node.prototype = {

	isVariationFirstNode : function() {
		var pn = this.previousNode;
		return !pn || pn.belongingVariation !== this.belongingVariation;
	},

	isVariationLastNode : function() {
		return !this.nextNode && !this.variations;
	},

	isGameBegining : function() {
		var pn = this.previousNode;
		var v = this.belongingVariation;
		// !pn && v.realGame && !v.parentVariation
		return (!pn && v instanceof GameModel);
	},

	isSetup : function() {
		return !!this.setup;
	},

	hasComment : function() {
		return !!(this.basic && this.basic['C']);
	},

	hasMarks : function() {
		return !!this.marks;
	},

	hasRemark : function() {
		return !!this.remark;
	},

	findNodeInAncestors : function(predicate) {
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
	},

	findNodeInMainline : function(predicate) {
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
	},

	findNodeInSuccessors : function(predicate) {
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
	},

	traverseSuccessorNodes : function(nodeCallback, variationCallback) {
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
	},

	nextNodeAt : function(coor) {
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
	},

	nextPass : function(color) {
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
	},

	nextMoveColor : function() {
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
	},

	setMoveNumber : function() {
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
	},

	resetMoveNumber : function() {
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
	},

	setBranchPoints : function() {
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
	},

	diffPosition : function(fromNode) {
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
};
