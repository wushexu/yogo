let util=require("../util");
let {GameModel,Variation,Node}=require("../game_model/model");

let SgfParser=require('../game_model/sgf_parser');
let SgfExport=require('../game_model/sgf_export');

let Board=require("../board/board");
let Game=require("../game/game");
let GameTree=require("./game_tree");
let EventHandler=require("./event_handler");


class GameCenter {

	constructor(selector) {
		this.$v = $(selector);
		if (this.$v.length == 0) {
			util.logWarn('no game viewer by this selector: ' + selector,
					'game viewer');
		} else if (this.$v.length > 1) {
			util.logWarn('more than one game viewer by this selector: ' + selector,
					'game viewer');
			this.$v = $(this.$v.get(0));
		}

		this.board = null;
		this.gameModel = null;
		this.game = null;
		this.gameTree = null;
		this.eventHandler = new EventHandler(this);
	}

	init(event) {

		var viewer = this;
		var $v = this.$v;

		$('button.paste-sgf', $v).click(function() {
			$('.paste-sgf-container', $v).show();
			var $textarea = $('textarea.sgf-text', $v);
			$textarea.get(0).select();
		});

		$('button.parse-sgf', $v).click(function() {
			var sgfText = $('textarea.sgf-text', $v).val();
			if (!sgfText.trim()) {
				return;
			}
			// TODO: save current

			viewer.loadGameFromSgfText(sgfText);

			$('.paste-sgf-container', $v).hide();
		});

		$('button.parse-sgf-cancel', $v).click(function() {

			$('.paste-sgf-container', $v).hide();
		});

		$('button.export-sgf', $v).click(function() {
			$('.export-sgf-container', $v).show();

			if (!viewer.gameModel) {
				return;
			}

			var expSgf = SgfExport.exportSgf(viewer.gameModel);

			$('textarea.export-sgf-text', $v).val(expSgf).get(0).select();
		});

		$('button.export-sgf-copy', $v).each(function() {
			var button=this;
			var clipboard=new Clipboard(button, {
				target: function() {
					return $(button).parent().find('textarea.export-sgf-text').get(0);
				}
			});
			clipboard.on('success', function(e) {
				$('.export-sgf-container', $v).hide();
			});
		});

		$('button.export-sgf-close', $v).click(function() {

			$('.export-sgf-container', $v).hide();
		});

		$('button.node-history', $v).click(function() {
			if (!viewer.game) {
				return;
			}

			var dir = $(this).data('value');
			if (dir === 'goback') {
				viewer.game.historyGoback();
			} else if (dir === 'goforward') {
				viewer.game.historyGoforward();
			}
		});

		$('button.new-game', $v).click(function() {
			// TODO: save current

			var bz = $('input.new-game-size', $v).val();
			var hc = $('input.new-game-handicap', $v).val();
			viewer.newGame(bz, hc);
		});

		$('button.perspective', $v).click(function() {
			if (!viewer.board) {
				return;
			}
			var perspective = $(this).data('value');
			var fn = viewer.board[perspective];
			if (typeof (fn) !== 'function') {
				return;
			}
			fn.call(viewer.board);
		});

		$('button.node-finder', $v).click(function() {
			if (!viewer.game) {
				return;
			}
			var navi = $(this).data('navi');
			var fn = viewer.game[navi];
			if (typeof (fn) !== 'function') {
				return;
			}
			fn.call(viewer.game);
		});

		$('input.game-op-mode', $v).click(function() {
			if (!viewer.game) {
				return;
			}
			var mode = $(this).val();
			viewer.game.setMode(mode);
			if (mode === 'auto-play') {
				viewer.game.startAutoPlay();
			} else {
				viewer.game.stopAutoPlay();
			}
		});

		$('input.game-edit-mode', $v).click(function() {
			if (!viewer.game) {
				return;
			}
			var mode = $(this).val();
			var param = $(this).data('param');
			viewer.game.setEditMode(mode, param);
		});

		$('button.play-mode', $v).click(function() {
			if (!viewer.game) {
				return;
			}
			var op = $(this).data('value');
			if (op == 'pass') {
				viewer.game.passMove();
			} else if (op == 'cancel-latest') {
				viewer.game.removeLastNode();
			} else if (op == 'black-first') {
				viewer.game.setPlayFirst('B');
			} else if (op == 'white-first') {
				viewer.game.setPlayFirst('W');
			}
		});

		$('button.auto-play', $v).click(function() {
			if (!viewer.game) {
				return;
			}
			var op = $(this).data('value');
			if (op == 'start') {
				viewer.game.startAutoPlay();
			} else if (op == 'stop') {
				viewer.game.stopAutoPlay();
			}
		});

		$('input.auto-play-interval', $v).change(function() {
			if (!viewer.game) {
				return;
			}
			viewer.game.setAutoPlayInterval(this.value);
		});

		$('button.goto-node', $v).click(function() {
			if (!viewer.game) {
				return;
			}
			var number = $('.move-number-input', $v).val();
			viewer.game.gotoNode(number);
		});

		$('input.move-number-input', $v).keydown(function(e) {
			if (!viewer.game) {
				return;
			}
			if (e.keyCode == 13) {
				viewer.game.gotoNode(this.value);
				this.blur();
			}else if (e.keyCode >= 37 && e.keyCode <= 40) {
				e.stopPropagation();
			}
		});

		$('.branch-select', $v).on('click', 'button.branch', function() {
			var branch = $(this).data('branch');
			viewer.game.goinBranch(branch);
		});

		$('button.coordinate', $v).click(function() {
			var board = viewer.board;
			if (!board) {
				return;
			}
			var type = $(this).data('type');
			if (type === 'show' || type === true) {
				board.showCoordinate();
			} else if (type === 'hide' || type === false) {
				board.hideCoordinate();
			} else {
				type = '' + type;
				if (type.indexOf(',') >= 0) {
					var xy = type.split(',');
					if (xy[0]) {
						board.setXCoordinateType(xy[0]);
					}
					if (xy[1]) {
						board.setYCoordinateType(xy[1]);
					}
				} else {
					board.setXCoordinateType(type);
					board.setYCoordinateType(type);
				}
			}
		});

		$('button.move-number', $v).click(function() {
			var game = viewer.game;
			if (!game) {
				return;
			}
			var value = $(this).data('value');
			if (value === true || value === 'true') {
				game.setShowMoveNumber(true);
			} else if (value === false || value === 'false') {
				game.setShowMoveNumber(false);
			} else {
				game.setShowMoveNumber(value);
			}
		});

		$('button.reset-move-number', $v).click(function() {
			var game = viewer.game;
			if (!game) {
				return;
			}
			var value = $(this).data('value');
			game.resetMoveNumber(value);
		});

		$('button.mark-current-move', $v).click(function() {
			if (!viewer.game) {
				return;
			}
			var value = $(this).data('value');
			if (value === 'true') {
				value = true;
			} else if (value === 'false') {
				value = false;
			}
			viewer.game.setMarkCurrentMove(value);
		});

		$('button.zoom', $v).click(function() {
			if (!viewer.board) {
				return;
			}
			var zoom = $(this).data('zoom');
			if (zoom == 'reset') {
				zoom = null;
			}
			viewer.board.zoomBoard(zoom);
		});

		var $treeContainer = $('.game-tree-container', $v);
		$treeContainer.on('click', 'li.node-group-head, li.variation-head',
				function() {
					var $treeNodes = $(this).next();
					$treeNodes.toggle(200);
				}).on('click', 'li.tree-node', function() {
			viewer.game.gotoNode(this.id);
		});

		$('button.collapse-nodes', $treeContainer).click(function() {
			$('ul.tree-nodes:visible', $treeContainer).hide(200);
		});

		$('button.show-current-node', $treeContainer).click(function() {
			if (!viewer.gameTree || !viewer.game) {
				return;
			}
			viewer.gameTree.showNode(viewer.game.curNode.id, true);
		});

		$('select.node-group-count', $treeContainer).change(function() {
			if (!viewer.gameTree || !viewer.game) {
				return;
			}
			viewer.gameTree.setGroupMoveCount($(this).val());
		});

		this._handlerFullscreen();
	}

	_handlerFullscreen() {
		var viewer = this;
		var $v = this.$v;

		var lastFullscreenElement;
		var showCoordinate;
		var onfullscreenchange = function(e) {
			var isFullScreen = document.webkitIsFullScreen;
			if (typeof (isFullScreen) === 'undefined') {
				isFullScreen = document.mozFullScreen;
			}
			if (isFullScreen === true) {
				lastFullscreenElement = document.webkitFullscreenElement;
				if (!lastFullscreenElement) {
					lastFullscreenElement = document.mozFullScreenElement;
				}
				if (!lastFullscreenElement) {
					lastFullscreenElement = document.msFullscreenElement;
				}
				var $fe = $(lastFullscreenElement);
				if ($fe.is('.board-container')) {
					var width = $(window).width();
					var height = $(window).height();
					if (height < width) {
						width = height;
					}
					$fe.width(width).height(width);
				}
			} else if (isFullScreen === false && lastFullscreenElement) {
				var $fe = $(lastFullscreenElement);
				if ($fe.is('.board-container')) {
					var width = $fe.data('width');
					var height = $fe.data('height');
					$fe.width(width).height(height);
				}
				lastFullscreenElement = null;
				if (showCoordinate) {
					viewer.board.showCoordinate();
				} else {
					viewer.board.hideCoordinate();
				}
			}
		}

		$(document).on(
				'fullscreenchange webkitfullscreenchange mozfullscreenchange'
						+ ' fullscreenchange msfullscreenchange',
				onfullscreenchange);

		$('button.fullscreen', $v).click(function() {
			if (!viewer.board) {
				return;
			}

			var elem;
			var elemName = $(this).data('value');
			if (elemName === 'board') {
				elem = viewer.board.boardContainer;
			} else if (elemName === 'viewer') {
				elem = viewer.$v.get(0);
			}
			if (elem) {
				if (elem.requestFullscreen) {
					elem.requestFullscreen();
				} else if (elem.msRequestFullscreen) {
					elem.msRequestFullscreen();
				} else if (elem.mozRequestFullScreen) {
					elem.mozRequestFullScreen();
				} else if (elem.webkitRequestFullscreen) {
					elem.webkitRequestFullscreen();
				}

				if (elemName === 'board') {
					showCoordinate = viewer.board.coordinateStatus().show;
					viewer.board.hideCoordinate();
				}
			}
		});

		// exitFullscreen,webkitExitFullscreen,mozCancelFullScreen,msExitFullscreen
	}

	onPlayNode() {
		var $v = this.$v;
		var curNode = this.game.curNode;

		var comment = '';
		if (curNode.basic['C']) {
			comment = curNode.basic['C'];
		}
		$('.comment-box', $v).text(comment);

		var remarkText = '';
		if (curNode.remark) {
			var rns = [
					[ [ 'GB', 'Good for Black' ], [ 'GW', 'Good for White' ] ],
					[ [ 'UC', 'Unclear Position' ], [ 'DM', 'Even Position' ] ],
					[ [ 'TE', 'Tesuji' ], [ 'BM', 'Bad Move' ] ],
					[ [ 'DO', 'Doubtful' ], [ 'IT', 'Interesting' ] ],
					[ [ 'HO', 'Hotspot' ] ] ];
			var remark = curNode.remark;
			for (var i = 0; i < rns.length; i++) {
				var exclusiveGroup = rns[i];
				for (var j = 0; j < exclusiveGroup.length; j++) {
					var remProp = exclusiveGroup[0];
					var name = remProp[0], text = remProp[1];
					var value = remark[name];
					if (!value) {
						continue;
					}
					if (remarkText != '') {
						remarkText += '  ';
					}
					remarkText += text;
					if (value == 2) {
						remarkText += '!';
					} else {
						remarkText += '.';
					}
					break;
				}
			}
		}
		$('.remark', $v).text(remarkText);

		var captures = curNode.move.accumulatedCaptures;
		$(".play-status .black-capture", $v).text(captures['B']);
		$(".play-status .white-capture", $v).text(captures['W']);

		$('.branch-select', $v).hide().find('button.branch').hide();
		if (curNode.variations) {
			var indexFrom = curNode.belongingVariation.realGame ? 1 : 0;
			for (var vi = indexFrom; vi < curNode.variations.length; vi++) {
				var subVariation = curNode.variations[vi];
				var label = String.fromCharCode(65 + subVariation.index);
				var $branchButton = $('.branch-select button.branch' + label);
				if ($branchButton.length > 0) {
					$branchButton.show();
				} else {
					$('.branch-select', $v).append(
							'<button class="branch branch' + label
									+ '" data-branch="' + label + '">' + label
									+ '</button>');
				}
			}
			$('.branch-select', $v).show();
		}
		if (curNode.belongingVariation.realGame) {
			$('.in-branch', $v).hide();
		} else {
			$('.in-branch', $v).show();
		}

		if (this.gameTree) {
			this.gameTree.showNode(curNode.id);
		}
	}

	_initGame() {

		this.setPlayStatus();

		this.setGameInfo();

		this.setupGame();

		this.setupGameTree();

		this.bindKeyAndWheelEvent();

		this.game.onPlayNode = this.onPlayNode.bind(this);

		this.game.onNodeCreated = this.onNodeCreated.bind(this);

		this.game.onNodeChanged = this.onNodeChanged.bind(this);

		this.game.onNodeRemoved = this.onNodeRemoved.bind(this);

		this.game.gotoBeginning();
	}

	newGame(boardSize, handicap) {

		if (boardSize) {
			boardSize = parseInt(boardSize);
			if (!isNaN(boardSize)) {
				if (boardSize < 5) {
					boardSize = 5;
				} else if (boardSize > 23) {
					boardSize = 23;
				}
			}
		}
		boardSize = boardSize || 19;
		if (boardSize % 2 == 0) {
			boardSize += 1;
		}

		var handicapPoints = null;
		if (handicap) {
			handicap = parseInt(handicap);
			if (!isNaN(handicap)) {
				if (handicap < 2) {
					handicap = null;
				} else if (handicap > 9) {
					handicap = 9;
				}
			}
			if (handicap) {
				handicapPoints = Game.getHandicapPoints(boardSize, handicap);
			}
		}

		var gameModel = this.gameModel = GameModel.newModel(boardSize,
				handicapPoints);

		this.setupBoard();
		this._initGame();

		if (this.gameTree) {
			this.gameTree.showNode(gameModel.nodes[0].id);
		}

		$('input.game-op-mode[value=edit]', this.$v).click();
	}

	loadGameFromSgfText(sgfText) {

		var gameCollection = SgfParser.parse(sgfText);

		this.gameModel = gameCollection[0];
		if (!this.gameModel) {
			return;
		}

		this.setupBoard();

		this._initGame();

		$('input.game-op-mode[value=view]', this.$v).click();
	}

	setupBoard() {

		var $v = this.$v;
		if (!this.gameModel) {
			return;
		}

		if (this.board && this.board.boardSize === this.gameModel.boardSize) {
			this.board.clearBoard();
			return;
		}

		var existedPaper = this.game && this.game.board.paper;

		var $boardContainer = $(".board-container", $v);
		$boardContainer.data('width', $boardContainer.width());
		$boardContainer.data('height', $boardContainer.height());

		$boardContainer.bind('contextmenu', function() {
			return false;
		});
		this.board = new Board($boardContainer.get(0),
				this.gameModel.boardSize, existedPaper);

		this.board.drawBoard();
	}

	setupGame() {

		this.game = new Game(this.board, this.gameModel);
		this.game.buildAllPositions();

		$('input.auto-play-interval', this.$v).change();
	}

	setPlayStatus() {

		var $ps = $('.play-status', this.$v);
		var gameInfo = this.gameModel.gameInfo;
		var blackPlayer = gameInfo.blackPlayer;
		var whitePlayer = gameInfo.whitePlayer;

		var player = '';
		if (blackPlayer) {
			player = blackPlayer.name;
			if (blackPlayer.rank) {
				player = player + ' ' + blackPlayer.rank;
			}
		}
		$(".black-player-name", $ps).text(player);

		player = '';
		if (whitePlayer) {
			player = whitePlayer.name;
			if (whitePlayer.rank) {
				player = player + ' ' + whitePlayer.rank;
			}
		}
		$(".white-player-name", $ps).text(player);
	}

	setGameInfo() {
		var $gi = $('.game-info', this.$v);
		var gameInfo = this.gameModel.gameInfo;

		for (var pi = 0; pi < 2; pi++) {
			var color = (pi == 0) ? 'black' : 'white';
			var player = gameInfo[color + 'Player'];
			if (!player) {
				continue;
			}
			var $ec = $('.' + color + '-player', $gi);
			$('.name', $ec).text(player.name || '');
			$('.rank', $ec).text(player.rank || '');
			$('.species', $ec).text(player.species || '');
			$('.term', $ec).text(player.term || '');
		}

		var basic = gameInfo.basic || {};
		$('.game-name', $gi).text(basic['GN'] || '');
		$('.event', $gi).text(basic['EV'] || '');
		$('.round', $gi).text(basic['RO'] || '');
		$('.game-date', $gi).text(basic['DT'] || '');
		$('.place', $gi).text(basic['PC'] || '');
		var gameResult = basic['RE'] || '';
		if (gameResult) {
			// 0/?/Void/W+[Score/R/Resign/T/Time/F/Forfeit]
		}
		$('.game-result', $gi).text(gameResult);

		var rule = gameInfo.rule || {};
		$('.handicap', $gi).text(rule['HA'] || '');
		$('.komi', $gi).text(rule['KM'] || '');
		$('.time-limit', $gi).text(rule['TM'] || '');
		$('.byo-yomi', $gi).text(rule['OT'] || '');

		var recorder = gameInfo.recorder || {};
		$('.user', $gi).text(recorder['US'] || '');
		$('.source', $gi).text(recorder['SO'] || '');
		$('.app', $gi).text(recorder['AP'] || '');

		var misc = gameInfo.misc || {};
		$('.annotate-by', $gi).text(misc['ON'] || '');
		$('.game-comment', $gi).text(misc['CP'] || '');
		$('.copyright', $gi).text(misc['AN'] || '');
	}

	setupGameTree() {

		var $treeContainer = $('.game-tree-container', this.$v);
		this.gameTree = new GameTree($treeContainer, this.game);

		var groupMoveCount=$('select.node-group-count', $treeContainer).val();
		if(parseInt(groupMoveCount)){
			this.gameTree.groupMoveCount=groupMoveCount;
		}

		this.gameTree.setup();
	}

	bindKeyAndWheelEvent() {

		let eventHandler=this.eventHandler;

		$('body').bind('keydown', eventHandler.keydownHandler.bind(eventHandler));

		var mousewheelHandler = eventHandler.mousewheelHandler.bind(eventHandler);

		$('.board-container').bind('mousewheel DOMMouseScroll',
				mousewheelHandler);
	}

	onNodeCreated(newNode) {
		if (this.gameTree) {
			this.gameTree.addNode(newNode);
		}
	}

	onNodeChanged(node) {
		if (this.gameTree) {
			this.gameTree.changeNodeInfo(node);
		}
	}

	onNodeRemoved(node, newVariation0) {
		if (this.gameTree) {
			this.gameTree.removeLastNode(node, newVariation0);
		}
	}
}


module.exports=GameCenter;
