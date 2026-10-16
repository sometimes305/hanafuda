(function () {
  const ROOM_TYPE = "aitools_game_room";
  const PEER_PREFIX = "hanafuda_koikoi_rt_";
  const SDK_TIMEOUT_MS = 30000;

  const online = {
    isGravity: window.self !== window.top || new URLSearchParams(window.location.search).has("username") || new URLSearchParams(window.location.search).has("room_id") || new URLSearchParams(window.location.search).has("roomid"),
    gravityRequests: {},
    gravityRoomRequests: {},
    gravityUserInfo: null,
    localPlayerName: "Player",
    localPlayerIcon: null,
    roomId: null,
    hostPeerId: null,
    peer: null,
    conn: null,
    conns: [],
    online: false,
    host: true,
    bound: false,
    statusMessage: "",
    lastBridgeEvent: "",
    participants: [],

    isHost() {
      return this.online && this.host;
    },

    shouldSendAction() {
      return this.online && !this.host && this.conn && this.conn.open;
    },

    bindControls() {
      const nameInput = document.querySelector("#username");
      const joinNameInput = document.querySelector("#usernameJoin");
      const goCreateButton = document.querySelector("#goCreateRoomButton");
      const goJoinButton = document.querySelector("#goJoinRoomButton");
      const createButton = document.querySelector("#createRoomButton");
      const refreshButton = document.querySelector("#refreshRoomsButton");
      const joinButton = document.querySelector("#joinRoomButton");
      const exitButton = document.querySelector("#exitRoomButton");

      if (nameInput && !nameInput.dataset.boundOnline) {
        nameInput.dataset.boundOnline = "1";
        nameInput.addEventListener("input", () => {
          this.localPlayerName = nameInput.value.trim() || "Player";
          window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
        });
      }
      if (joinNameInput && !joinNameInput.dataset.boundOnline) {
        joinNameInput.dataset.boundOnline = "1";
        joinNameInput.addEventListener("input", () => {
          this.localPlayerName = joinNameInput.value.trim() || "Player";
          window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
        });
      }
      if (goCreateButton && !goCreateButton.dataset.boundOnline) {
        goCreateButton.dataset.boundOnline = "1";
        goCreateButton.addEventListener("click", () => this.showOnlineScreen("create"));
      }
      if (goJoinButton && !goJoinButton.dataset.boundOnline) {
        goJoinButton.dataset.boundOnline = "1";
        goJoinButton.addEventListener("click", () => {
          this.showOnlineScreen("join");
          this.fetchRoomList();
        });
      }
      document.querySelectorAll("[data-online-back]").forEach((button) => {
        if (button.dataset.boundOnline) return;
        button.dataset.boundOnline = "1";
        button.addEventListener("click", () => this.showOnlineScreen("home"));
      });
      if (createButton && !createButton.dataset.boundOnline) {
        createButton.dataset.boundOnline = "1";
        createButton.addEventListener("click", () => this.createRoom());
      }
      if (refreshButton && !refreshButton.dataset.boundOnline) {
        refreshButton.dataset.boundOnline = "1";
        refreshButton.addEventListener("click", () => this.fetchRoomList());
      }
      if (joinButton && !joinButton.dataset.boundOnline) {
        joinButton.dataset.boundOnline = "1";
        joinButton.addEventListener("click", () => {
          const input = document.querySelector("#joinRoomInput");
          this.joinRoom(input ? input.value.trim() : "");
        });
      }
      if (exitButton && !exitButton.dataset.boundOnline) {
        exitButton.dataset.boundOnline = "1";
        exitButton.addEventListener("click", () => this.exitRoom());
      }
      this.syncOnlineScreenState();
      this.refreshProfile();
      this.refreshStatus();
      this.renderRoomUi();
    },

    showOnlineScreen(name) {
      const screens = [...document.querySelectorAll(".online-screen[data-online-screen]")];
      if (!screens.length) {
        document.body.classList.remove("hidden");
        document.body.dataset.onlineScreen = "home";
        return;
      }
      const target = screens.find((screen) => screen.dataset.onlineScreen === name) ||
        screens.find((screen) => screen.dataset.onlineScreen === "home") ||
        screens[0];
      screens.forEach((screen) => {
        screen.classList.toggle("hidden", screen !== target);
      });
      document.body.classList.remove("hidden");
      document.body.dataset.onlineScreen = target.dataset.onlineScreen || "home";
      this.statusMessage = "";
      this.refreshStatus();
    },

    syncOnlineScreenState() {
      const screens = [...document.querySelectorAll(".online-screen[data-online-screen]")];
      let visible = screens.find((screen) => !screen.classList.contains("hidden"));
      if (!visible && screens.length) {
        visible = screens.find((screen) => screen.dataset.onlineScreen === "home") || screens[0];
        screens.forEach((screen) => {
          screen.classList.toggle("hidden", screen !== visible);
        });
      }
      document.body.classList.remove("hidden");
      document.body.dataset.onlineScreen = visible ? visible.dataset.onlineScreen : "home";
    },

    refreshProfile() {
      const input = document.querySelector("#username");
      const joinInput = document.querySelector("#usernameJoin");
      if (input && !input.value) input.value = this.localPlayerName;
      if (joinInput && !joinInput.value) joinInput.value = this.localPlayerName;
      window.TierGame.setPlayerName((input && input.value.trim()) || this.localPlayerName, this.localPlayerIcon);
    },

    refreshStatus(text) {
      const el = document.querySelector("#onlineStatus");
      const badge = document.querySelector("#onlineBadge");
      let message = "";
      if (text) {
        message = text;
        this.statusMessage = text;
        if (el) el.textContent = message;
        if (badge) badge.textContent = message;
        return;
      }
      if (this.statusMessage) {
        message = this.statusMessage;
        if (el) el.textContent = message;
        if (badge) badge.textContent = message;
        return;
      }
      if (!this.online) {
        message = "";
      } else {
        message = `${this.host ? "ホスト" : "ゲスト"} / 部屋ID: ${String(this.roomId || "----")}`;
      }
      if (el) el.textContent = message;
      if (badge) badge.textContent = message;
      this.renderRoomUi();
    },

    renderRoomUi() {
      document.body.dataset.online = this.online ? "connected" : "lobby";
      document.body.dataset.role = this.online ? (this.host ? "host" : "guest") : "none";
      const panel = document.querySelector("#roomPanel");
      const roomId = document.querySelector("#activeRoomId");
      if (panel) panel.classList.toggle("hidden", !this.online);
      if (roomId) {
        const displayRoomId = this.roomId ? String(this.roomId) : "未入室";
        roomId.textContent = displayRoomId;
        roomId.title = displayRoomId;
      }
      this.renderParticipants();
    },

    renderParticipants() {
      const list = document.querySelector("#participantList");
      if (!list) return;
      list.innerHTML = "";
      const members = this.participants.length ? this.participants : [{ id: "self", name: this.localPlayerName, icon: this.localPlayerIcon }];
      members.forEach((member) => {
        const chip = document.createElement("div");
        chip.className = "participant-chip";
        if (member.icon) {
          const img = document.createElement("img");
          img.src = member.icon;
          img.alt = member.name || "player";
          chip.append(img);
        } else {
          const initial = document.createElement("span");
          initial.className = "participant-initial";
          initial.textContent = (member.name || "名").slice(0, 1);
          chip.append(initial);
        }
        const name = document.createElement("span");
        name.textContent = member.name || "Player";
        chip.append(name);
        list.append(chip);
      });
    },

    notifyParticipantsChanged() {
      if (window.TierGame && typeof window.TierGame.refresh === "function") {
        window.TierGame.refresh();
      }
    },

    setParticipants(players) {
      const normalized = (players || []).map((player, index) => this.normalizeParticipant(player, index)).filter(Boolean);
      const self = this.normalizeParticipant({
        id: "self",
        name: this.localPlayerName,
        icon: this.localPlayerIcon
      }, -1);
      const withoutSelf = normalized.filter((player) => player.id !== self.id && player.name !== self.name);
      this.participants = [self, ...withoutSelf];
      this.renderParticipants();
      this.notifyParticipantsChanged();
    },

    upsertParticipant(player) {
      const normalized = this.normalizeParticipant(player, this.participants.length);
      if (!normalized) return;
      const existingIndex = this.participants.findIndex((item) => item.id === normalized.id || item.name === normalized.name);
      if (existingIndex >= 0) {
        this.participants[existingIndex] = { ...this.participants[existingIndex], ...normalized };
      } else {
        this.participants.push(normalized);
      }
      this.renderParticipants();
      this.notifyParticipantsChanged();
    },

    normalizeParticipant(raw, index) {
      if (!raw || typeof raw !== "object") return null;
      const name = raw.name || raw.nickname || raw.user_name || raw.userName || raw.nick_name || raw.player_name || `Player${index + 1}`;
      const icon = raw.portrait || raw.avatar || raw.icon || raw.head_img || raw.headimgurl || raw.profile_image || raw.profileImage || null;
      const id = raw.id || raw.user_id || raw.userId || raw.open_id || raw.openId || name;
      return { id: String(id), name: String(name), icon };
    },

    getGameParticipantNames() {
      const names = [];
      const pushName = (name) => {
        const safeName = String(name || "").trim();
        if (!safeName) return;
        if (!names.some((item) => item.toLowerCase() === safeName.toLowerCase())) names.push(safeName);
      };

      pushName(this.localPlayerName);
      if (this.host) {
        this.conns.forEach((conn) => {
          if (conn && conn.open && conn._playerName) pushName(conn._playerName);
        });
        return names;
      }

      this.participants.forEach((player) => pushName(player.name));
      return names;
    },

    makeHostPeerId(roomId) {
      let rid = String(roomId || "").replace(/[^a-zA-Z0-9_-]/g, "");
      if (!rid) rid = "room";
      return PEER_PREFIX + rid.slice(-24);
    },

    async parseData(data) {
      try {
        if (typeof Blob !== "undefined" && data instanceof Blob) data = await data.text();
        else if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) data = new TextDecoder().decode(new Uint8Array(data));
        if (typeof data === "string") data = JSON.parse(data);
        return data && typeof data === "object" ? data : null;
      } catch {
        return null;
      }
    },

    stopRealtime() {
      this.conns.forEach((conn) => {
        try {
          if (conn && conn.open) conn.close();
        } catch {}
      });
      this.conns = [];
      try {
        if (this.conn && this.conn.open) this.conn.close();
      } catch {}
      this.conn = null;
      try {
        if (this.peer) this.peer.destroy();
      } catch {}
      this.peer = null;
    },

    startHostPeer(roomId) {
      this.stopRealtime();
      this.hostPeerId = this.makeHostPeerId(roomId);
      if (!window.Peer) {
        this.refreshStatus("PeerJSを読み込めませんでした");
        return;
      }
      this.peer = new Peer(this.hostPeerId);
      this.peer.on("open", () => {
        this.refreshStatus();
        this.broadcastState(window.TierGame.exportState());
      });
      this.peer.on("connection", (conn) => {
        conn.on("data", async (raw) => {
          const msg = await this.parseData(raw);
          if (!msg) return;
          this.handleHostMessage(conn, msg);
        });
        conn.on("close", () => {
          this.conns = this.conns.filter((item) => item !== conn);
          if (conn._playerName) {
            this.participants = this.participants.filter((item) => item.name !== conn._playerName && item.id !== conn.peer);
            this.renderParticipants();
            this.notifyParticipantsChanged();
          }
          this.refreshStatus(`${conn._playerName || "プレイヤー"}が退出しました`);
        });
        conn.on("error", () => {
          this.conns = this.conns.filter((item) => item !== conn);
        });
        this.conns.push(conn);
      });
      this.peer.on("error", (error) => {
        console.warn("[HanafudaOnline] host peer error:", error);
        this.refreshStatus("Peer接続エラー");
      });
    },

    startGuestPeer(roomId) {
      this.stopRealtime();
      this.hostPeerId = this.makeHostPeerId(roomId);
      if (!window.Peer) {
        this.refreshStatus("PeerJSを読み込めませんでした");
        return;
      }
      this.peer = new Peer();
      this.peer.on("open", () => {
        const conn = this.peer.connect(this.hostPeerId);
        this.conn = conn;
        conn.on("open", () => {
          conn.send({
            type: "handshake",
            name: this.localPlayerName,
            icon: this.localPlayerIcon
          });
          this.refreshStatus();
        });
        conn.on("data", async (raw) => {
          const msg = await this.parseData(raw);
          if (!msg) return;
          this.handleGuestMessage(msg);
        });
        conn.on("close", () => this.refreshStatus("ホストとの接続が切れました"));
        conn.on("error", () => this.refreshStatus("ゲスト接続エラー"));
      });
      this.peer.on("error", (error) => {
        console.warn("[HanafudaOnline] guest peer error:", error);
        this.refreshStatus("Peer接続エラー");
      });
    },

    handleHostMessage(conn, msg) {
      if (msg.type === "handshake") {
        conn._playerName = msg.name || "Player";
        conn._playerIcon = msg.icon || null;
        this.upsertParticipant({
          id: conn.peer || conn._playerName,
          name: conn._playerName,
          icon: conn._playerIcon
        });
        conn.send({ type: "state", state: this.stateForPlayer(conn._playerName) });
        const secret = this.secretForPlayer(conn._playerName);
        if (secret) conn.send({ type: "secret", secret });
        conn.send({ type: "config", settings: window.TierGame.readSetupForm ? window.TierGame.readSetupForm() : {} });
        this.refreshStatus(`${conn._playerName}が入室しました`);
        return;
      }
      if (msg.type === "action") {
        window.TierGame.applyRemoteAction(msg.action);
      }
    },

    handleGuestMessage(msg) {
      if (msg.type === "state" || msg.type === "rt_sync") {
        window.TierGame.importState(msg.state || msg.data || msg);
      }
      if (msg.type === "secret" && window.TierGame.importSecret) {
        window.TierGame.importSecret(msg.secret || msg.data || msg);
      }
      if (msg.type === "config" && window.TierGame.previewSetup) {
        window.TierGame.previewSetup(msg.settings || {});
      }
    },

    broadcastState(state) {
      if (!this.online || !this.host) return;
      this.conns.forEach((conn) => {
        if (!conn || !conn.open) return;
        try {
          conn.send({ type: "state", state: this.stateForPlayer(conn._playerName, state) });
          const secret = this.secretForPlayer(conn._playerName);
          if (secret) conn.send({ type: "secret", secret });
        } catch {}
      });
    },

    stateForPlayer(playerName, fallbackState) {
      if (window.TierGame && typeof window.TierGame.exportStateForPlayer === "function") {
        return window.TierGame.exportStateForPlayer(playerName || "");
      }
      return fallbackState || (window.TierGame && window.TierGame.exportState ? window.TierGame.exportState() : {});
    },

    secretForPlayer(playerName) {
      if (window.TierGame && typeof window.TierGame.exportSecretForPlayer === "function") {
        return window.TierGame.exportSecretForPlayer(playerName || "");
      }
      return null;
    },

    broadcastConfig(settings) {
      if (!this.online || !this.host) return;
      this.conns.forEach((conn) => {
        if (!conn || !conn.open) return;
        try {
          conn.send({ type: "config", settings });
        } catch {}
      });
    },

    sendAction(action) {
      if (!this.conn || !this.conn.open) {
        this.refreshStatus("ホストに未接続です");
        return;
      }
      this.conn.send({ type: "action", action });
    },

    async createRoom() {
      this.localPlayerName = window.TierGame.getPlayerName();
      this.host = true;
      this.online = true;
      this.statusMessage = "";
      this.refreshStatus("Gravityで部屋を作成中...");
      try {
        const capacity = 2;
        const permission = Number(document.querySelector("#roomPermission")?.value || 0);
        const res = await this.callGravityRoomSDK("create_room", {
          room_type: ROOM_TYPE,
          max_players: capacity,
          maxplayers: capacity,
          room_permission: permission,
          permission
        });
        const roomData = (res && res.data) || res || {};
        this.roomId = roomData.room_id || roomData.roomId;
        if (!this.roomId) throw new Error(`room_idが返ってきません: ${JSON.stringify(res)}`);
        this.startHostPeer(this.roomId);
        this.setParticipants([]);
        this.statusMessage = "";
        this.refreshStatus();
        if (window.TierGame.refresh) window.TierGame.refresh();
      } catch (error) {
        console.warn("[HanafudaOnline] create room failed:", error);
        this.online = false;
        this.refreshStatus(`部屋作成失敗: ${this.errorText(error)}`);
      }
    },

    async joinRoom(roomId) {
      let rid = String(roomId || "").trim();
      if (!rid) {
        this.refreshStatus("部屋IDを入力してください");
        return;
      }
      this.localPlayerName = window.TierGame.getPlayerName();
      this.host = false;
      this.online = true;
      this.statusMessage = "";
      this.refreshStatus("Gravityで入室中...");
      try {
        if (rid.length <= 10) rid = await this.findFullRoomId(rid);
        const joinResult = await this.callGravityRoomSDK("join_room", { room_id: rid });
        this.roomId = rid;
        this.setParticipants(this.extractPlayers(joinResult));
        this.startGuestPeer(rid);
        this.statusMessage = "";
        this.refreshStatus();
        if (window.TierGame.refresh) window.TierGame.refresh();
      } catch (error) {
        console.warn("[HanafudaOnline] join room failed:", error);
        this.online = false;
        this.refreshStatus(`入室失敗: ${this.errorText(error)}`);
      }
    },

    async fetchRoomList() {
      const list = document.querySelector("#roomList");
      if (!list) return;
      list.innerHTML = '<div class="room-list-loading">読み込み中...</div>';
      try {
        const rooms = await this.getPublicRooms();
        if (!rooms.length) {
          list.innerHTML = '<div class="room-list-empty">現在公開中の部屋はありません。</div>';
          return;
        }
        list.innerHTML = "";
        rooms.forEach((room) => {
          const roomId = String(room.room_id || room.roomId || room.id || "");
          const count = room.gamer_num || room.current_players || room.player_count || room.online_users || room.user_count || 0;
          const max = room.max_players || room.max_user_count || 2;
          const created = this.formatRoomTime(room.create_time || room.created_at || room.createTime || room.createdAt);
          const card = document.createElement("div");
          card.className = "room-card";
          card.innerHTML = `
            <div>
              <div class="room-title">部屋ID: ${roomId.slice(-5)}</div>
              <div class="room-meta">${count}/${max}人 / ${created}</div>
            </div>
          `;
          const join = document.createElement("button");
          join.type = "button";
          join.textContent = "入室";
          join.addEventListener("click", () => this.joinRoom(roomId));
          card.append(join);
          list.append(card);
        });
      } catch (error) {
        console.warn("[HanafudaOnline] fetch rooms failed:", error);
        list.innerHTML = `<div class="room-list-empty">ルーム情報の取得に失敗しました: ${this.escapeHtml(this.errorText(error))}</div>`;
      }
    },

    async getPublicRooms() {
      const res = await this.callGravityRoomSDK("get_public_rooms", {
        room_type: ROOM_TYPE,
        page_num: 1,
        page_size: 20
      });
      let rooms = [];
      if (res) {
        if (res.data && res.data.list) rooms = res.data.list;
        else if (res.data && Array.isArray(res.data)) rooms = res.data;
        else if (res.list) rooms = res.list;
        else if (res.rooms) rooms = res.rooms;
        else if (Array.isArray(res)) rooms = res;
      }
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      return rooms.filter((room) => {
        const ts = room.create_time || room.created_at || room.createTime || room.createdAt;
        if (!ts) return true;
        let date = new Date(ts);
        if (date.getFullYear() < 2000) date = new Date(ts * 1000);
        if (Number.isNaN(date.getTime())) return true;
        return now - date.getTime() < tenMinutes;
      });
    },

    formatRoomTime(value) {
      if (!value) return "作成時刻不明";
      let date = new Date(value);
      if (date.getFullYear() < 2000) date = new Date(value * 1000);
      if (Number.isNaN(date.getTime())) return "作成時刻不明";
      const pad = (num) => String(num).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    extractPlayers(result) {
      const data = (result && result.data) || result || {};
      return data.players || data.player_list || data.gamers || data.user_list || data.users || data.list || [];
    },

    exitRoom() {
      this.refreshStatus("退出中...");
      if (this.online || this.roomId) {
        this.callGravityRoomSDK("exit", {}).catch((error) => {
          console.warn("[HanafudaOnline] exit failed:", error);
        });
      }
      this.online = false;
      this.host = true;
      this.roomId = null;
      this.statusMessage = "";
      this.participants = [];
      this.stopRealtime();
      this.refreshStatus("ロビーに戻りました");
      if (window.TierGame.refresh) window.TierGame.refresh();
      this.showOnlineScreen("home");
      this.fetchRoomList();
    },

    async findFullRoomId(shortId) {
      const rooms = await this.getPublicRooms();
      const found = rooms.find((room) => String(room.room_id || room.roomId || room.id || "").endsWith(shortId));
      if (!found) throw new Error("部屋が見つかりません。非公開部屋の場合はホスト画面のフルIDを入力してください");
      return String(found.room_id || found.roomId || found.id || "");
    },

    callGravitySDK(action, params) {
      return new Promise((resolve, reject) => {
        const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const timer = window.setTimeout(() => {
          delete this.gravityRequests[requestId];
          reject(new Error(`${action} timeout / last=${this.lastBridgeEvent || "none"}`));
        }, SDK_TIMEOUT_MS);
        this.gravityRequests[requestId] = { resolve, reject, timer };
        this.postToGravity({
          type: "API",
          action,
          requestId,
          params: params || {}
        });
      });
    },

    callGravityRoomSDK(action, params) {
      return new Promise((resolve, reject) => {
        const requestId = `${action}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const timer = window.setTimeout(() => {
          delete this.gravityRoomRequests[requestId];
          reject(new Error(`${action} timeout / last=${this.lastBridgeEvent || "none"}`));
        }, SDK_TIMEOUT_MS);
        this.gravityRoomRequests[requestId] = { resolve, reject, timer };
        const message = { action, actionId: requestId, actionld: requestId };
        if (params) Object.assign(message, params);
        this.postToGravity(message);
      });
    },

    postToGravity(message) {
      try {
        window.parent.postMessage(message, "*");
      } catch {}
      try {
        if (window.top && window.top !== window.parent) window.top.postMessage(message, "*");
      } catch {}
      try {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      } catch {}
      console.log("[HanafudaOnline] postToGravity:", JSON.stringify(message));
    },

    async initGravityUser() {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlName = params.get("username");
        const rawIcon = params.get("portrait") || params.get("avatar") || params.get("icon") || params.get("head_img") || params.get("headimgurl");
        const autoRoomId = params.get("room_id") || params.get("roomid");
        if (autoRoomId) {
          this.fillRoomId(autoRoomId);
          setTimeout(() => this.joinRoom(autoRoomId), 300);
        }
        if (urlName) {
          this.localPlayerName = urlName;
          this.localPlayerIcon = rawIcon ? decodeURIComponent(rawIcon) : null;
          window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
          this.initRoomIdInput();
          this.registerReceiveMessage();
          return;
        }
      } catch {}

      if (!this.isGravity) {
        window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
        this.refreshStatus("");
        return;
      }

      try {
        this.refreshStatus("Gravityユーザー取得中...");
        const user = await this.callGravitySDK("AgentSDK.user.getMyUserInfo");
        const normalized = this.normalizeUser(user);
        if (normalized && normalized.name) {
          this.gravityUserInfo = user;
          this.localPlayerName = normalized.name;
          this.localPlayerIcon = normalized.icon;
          window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
          this.refreshStatus("Gravityユーザー取得済み");
        } else {
          this.refreshStatus(`ユーザー情報なし: ${JSON.stringify(user || {})}`.slice(0, 80));
        }
      } catch (error) {
        console.warn("[HanafudaOnline] Gravity user load failed:", error);
        this.refreshStatus(`ユーザー取得失敗: ${this.errorText(error)}`);
      }
      this.initRoomIdInput();
      this.registerReceiveMessage();
    },

    async initRoomIdInput() {
      try {
        if (window.AgentSDK && window.AgentSDK.room && typeof window.AgentSDK.room.getRoomId === "function") {
          const result = await window.AgentSDK.room.getRoomId();
          const roomId = result && (result.room_id || result.roomId || result.data?.room_id || result.data?.roomId || result.data);
          if (roomId) this.fillRoomId(roomId);
        }
      } catch (error) {
        console.warn("[HanafudaOnline] getRoomId direct failed:", error);
      }
    },

    fillRoomId(roomId) {
      const input = document.querySelector("#joinRoomInput");
      if (input && roomId) input.value = String(roomId).slice(-5);
    },

    registerReceiveMessage() {
      try {
        if (window.AgentSDK && window.AgentSDK.room && typeof window.AgentSDK.room.receiveMessage === "function") {
          window.AgentSDK.room.receiveMessage((payload) => this.handleRoomEvent(payload));
        }
      } catch (error) {
        console.warn("[HanafudaOnline] receiveMessage register failed:", error);
      }
    },

    handleRoomEvent(eventPayload) {
      const payload = eventPayload && (eventPayload.payload || eventPayload);
      if (!payload || typeof payload !== "object") return;
      const type = payload.type;
      const data = payload.data || {};
      if (type === "aitools_game_joinroom" || type === "aitoolsgamejoinroom") {
        const joined = this.normalizeParticipant(data, this.participants.length);
        if (joined && !this.participants.some((item) => item.id === joined.id || item.name === joined.name)) {
          this.participants.push(joined);
          this.renderParticipants();
          this.notifyParticipantsChanged();
        }
        this.refreshStatus(`${joined ? joined.name : "プレイヤー"}が入室しました`);
        return;
      }
      if (type === "aitools_game_exitroom" || type === "aitoolsgameexitroom") {
        const leaving = this.normalizeParticipant(data, 0);
        if (leaving) {
          this.participants = this.participants.filter((item) => item.id !== leaving.id && item.name !== leaving.name);
          this.renderParticipants();
          this.notifyParticipantsChanged();
        }
        this.refreshStatus(`${leaving ? leaving.name : "プレイヤー"}が退出しました`);
        return;
      }
      if (type === "aitools_game_sendmsg" || type === "aitoolsgamesendmsg") {
        try {
          let message = data.msg_data || data.message || payload.message;
          if (typeof message === "string") message = JSON.parse(message);
          if (typeof message === "string") message = JSON.parse(message);
          if (message && message.type === "state") window.TierGame.importState(message.state || message.data || message);
          if (message && message.type === "action" && this.host) window.TierGame.applyRemoteAction(message.action);
        } catch (error) {
          console.warn("[HanafudaOnline] sendmsg parse failed:", error);
        }
      }
    },

    normalizeUser(raw) {
      const user = (raw && raw.data) || (raw && raw.payload) || raw;
      if (!user || typeof user !== "object") return null;
      return {
        name: user.name || user.nickname || user.user_name || user.userName || user.nick_name || "",
        icon: user.portrait || user.avatar || user.icon || user.head_img || user.headimgurl || user.profile_image || user.profileImage || null
      };
    },

    errorText(error) {
      if (!error) return "unknown";
      if (typeof error === "string") return error;
      return error.message || JSON.stringify(error);
    },

    escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = value;
      return div.innerHTML;
    }
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    online.lastBridgeEvent = data.type || data.action || data.event || JSON.stringify(data).slice(0, 80);
    console.log("[HanafudaOnline] bridge message:", JSON.stringify(data).slice(0, 500));

    if (data.type === "API_CALLBACK" && data.requestId) {
      const req = online.gravityRequests[data.requestId];
      if (!req) return;
      window.clearTimeout(req.timer);
      if (data.error) req.reject(data.error);
      else req.resolve(data.payload || data.result || data.data);
      delete online.gravityRequests[data.requestId];
      return;
    }

    const responseId = data.actionId || data.actionld || data.requestId || data.reqId;
    const isRoomResponse =
      data.type === "gravityroomresponse" ||
      data.type === "gravity_room_response" ||
      data.type === "GRAVITY_ROOM_RESPONSE" ||
      data.type === "room_response" ||
      Boolean(responseId && online.gravityRoomRequests[responseId]);

    if (isRoomResponse && responseId) {
      const req = online.gravityRoomRequests[responseId];
      if (!req) return;
      window.clearTimeout(req.timer);
      const result = data.result || data.payload || data.data || data;
      if (result.errno !== undefined && result.errno !== 0) {
        req.reject(`SDK Error (errno:${result.errno}): ${result.errmsg || "Unknown"}`);
      } else {
        req.resolve(result);
      }
      delete online.gravityRoomRequests[responseId];
    }

    if (data.type === "gravityroomevent" || data.type === "gravity_room_event") {
      online.handleRoomEvent(data.payload || data);
    }
  });

  window.TierOnline = online;
  online.bindControls();
  online.initGravityUser();
})();
