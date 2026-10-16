# 通信仕様

このゲームは参照元の TierGame と同じ二層構成です。

- Gravity SDK: ユーザー情報、公開／非公開ルーム、入退室
- PeerJS: ホストとゲスト間のリアルタイム対局同期

## 識別子

- Gravity `room_type`: `aitools_game_room`
- Peer ID prefix: `hanafuda_koikoi_rt_`
- 最大人数: 2人

## 対局同期

ホストだけが正本の対局状態を更新します。ゲスト操作は `action` としてホストへ送り、ホストが検証・適用したあと各プレイヤー向けに `state` と `secret` を返します。

```json
{ "type": "action", "action": { "type": "play", "cardId": "1-1", "playerName": "Player" } }
```

公開状態の `hands` は常に空配列です。本人の手札だけを別メッセージで送ります。

```json
{ "type": "secret", "secret": { "seat": 1, "hand": ["1-1", "2-3"] } }
```

受け付ける対局アクションは `play`、`match`、`koi`、`nextRound`、`rematch` です。

## ブラウザ単体

Gravity 外で開いた場合もロビーは表示されます。「ひとりで試す」は通信を使わず、同じ対局ロジックで CPU と対戦します。
