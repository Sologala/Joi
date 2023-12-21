import { ChampSelectPhaseSession, TeamMemberInfo } from "../types/lcuType";
import { getCurrentAction, parseGameSessionData } from "./utils";
import { GameMode } from "../types/opgg_rank_type";
import { sendToWebContent } from "../util/util";
import { Handle } from "../const/const";
import logger from "../lib/logger";
import { banPickChampion, getCurrentChampId, getSummonerByPuuid } from "./lcuRequest";
import { setting } from "../config/";

let champId = 0;
let actionId: number | null;
let myTeam: TeamMemberInfo[] | null;
let roomId: string | null;

export async function processGameSessionData(data: ChampSelectPhaseSession, gameMode: GameMode) {
	//进行简单解析
	const sessionData = parseGameSessionData(data, gameMode);
	//logger.debug("ChampSelectPhaseSession", JSON.stringify(data));
	sendToWebContent(Handle.gameSessionData, sessionData);

	//发送当前对局我方成员
	if (!myTeam) {
		myTeam = [];
		//todo 重写，让前台来获取这些数据，方便写重试
		myTeam = await Promise.all(
			data.myTeam.map(async (t) => {
				const summonerInfo = await getSummonerByPuuid(t.puuid);
				return {
					puuid: t.puuid,
					summonerName: summonerInfo.displayName,
					summonerInfo: summonerInfo
				};
			})
		).catch((e) => {
			logger.error("查询成员信息失败：", (e as Error)?.message);
			return [];
		});
		sendToWebContent(Handle.gameSessionMyTeam, myTeam);
		roomId = data.chatDetails.multiUserChatId;
		sendToWebContent(Handle.gameSessionRoomId, roomId);
	}

	//获取当前活动

	const action = getCurrentAction(data);
	logger.info("currentAction is ", JSON.stringify(action));
	if (action && actionId !== action.id) {
		actionId = action.id; // 防止重复接收活动事件
		//todo 自动选择英雄 自动ban英雄

		let local_player_id = data.localPlayerCellId
		logger.info("current actor id", local_player_id, " current session actor id ", action.actorCellId);
		if (action.actorCellId == local_player_id && action.isInProgress) {
			logger.info("my turn to ", action.type);

			let setTime = 0;
			if (action.type === 'ban') {
				setTime = setting.model.autoBanDelay;
			}
			else if (action.type === 'pick') {
				setTime = setting.model.autoPIckDelay;
			}
			else {
				return;
			}

			setTimeout(async () => {
				try {
					if (action.type === 'ban' && setting.model.autoBan) {
						banPickChampion(action, setting.model.autoBanID, true, action.type)
					}
					else if (action.type === 'pick' && setting.model.autoPick) {
						banPickChampion(action, setting.model.autoPickID, true, action.type)
					}
				} catch (e) {
					logger.error(e);
				}
			}, setTime);

		}
		else if (action.actorCellId != local_player_id && gameMode == "rank" && action.isInProgress) {
			setTimeout(async () => {
				try {
					banPickChampion(action, setting.model.autoPickID, false, "pick")
				} catch (e) {
					logger.error(e);
				}
			}, 5);
		}
	}

	//获取当前锁定的英雄
	const currentChampId = await getCurrentChampId().catch(() => {
		return 0;
	});
	logger.info("currentChampId: ", currentChampId);
	//发送给前台自动设置符文
	if (currentChampId && currentChampId !== champId) {
		champId = currentChampId;
		//showMainWindow({ name: "inGame" });
		sendToWebContent(Handle.champSelect, currentChampId);
	}
}

//清空变量值
export function clearFlag() {
	myTeam = null;
	champId = 0;
	actionId = null;
	roomId = null;
}
