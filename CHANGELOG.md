# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Unreleased

### Added

- 注文アイテムに決済カードを追加
- 通貨転送取引番号リポジトリを追加

### Changed

- 金額オファー承認をChevre通貨転送取引連携へ変更
- Pecorino取引に対して取引番号を指定するように調整
- ポイント決済を出金取引へ変更

### Deprecated

### Removed

### Fixed

### Security

## v5.0.0 - 2020-05-04

### Added

- イベントオファー承認結果にamountを追加
- 注文にnameを追加
- COA予約承認にpriceSpecificationを追加
- ssktsムビチケ決済承認時に指定座席番号をムビチケに追加
- 決済方法にMGTicketを追加
- 決済方法にPrepaidCardを追加
- プリペイドカードインターフェースを追加
- プリペイドカード決済インターフェースを追加
- プリペイドカード返金インターフェースを追加

### Changed

- イベントオファー承認結果のpointをamountへ移行
- ムビチケディスカウントサービスを前売券決済サービスとして再定義
- 注文取引確定時の口座バリデーションを口座タイプ管理に対応

### Removed

- プロジェクトのvalidateMovieTicket設定を削除

## v4.0.0 - 2020-04-29

### Added

- 取引確定後アクションパラメータにインセンティブ付与を追加

### Changed

- 会員サービスのオファー属性をChevreへ移行
- 会員サービスリポジトリをChevreへ移行
- InMemoryオファーリポジトリをChevreへ移行
- インセンティブ付与承認アクションを、取引確定後アクションパラメータへ移行

### Removed

- ポイントインセンティブ承認アクション取消タスクを削除
- 口座タイプをChevre管理へ移行

## v3.6.0 - 2020-04-26

### Changed

- 会員サービスの特典ポイント属性をserviceOutputの中へ移行

## v3.5.0 - 2020-04-25

### Changed

- update @chevre/factory

## v3.4.0 - 2020-04-25

### Changed

- 会員プログラムの価格仕様参照をeligibleDurationからpriceSpecificationへ変更

## v3.3.0 - 2020-04-25

### Changed

- 会員プログラムの価格仕様参照をeligibleDurationからpriceSpecificationへ変更

## v3.2.0 - 2020-04-25

### Changed

- 会員プログラムの価格仕様参照をeligibleDurationからpriceSpecificationへ変更

## v3.1.0 - 2020-04-24

### Changed

- 会員プログラムインターフェースを最適化

## v3.0.0 - 2020-04-24

### Changed

- 所有権対象のメンバーシップの属性を最適化
- ssktsにおける会員プログラムの特典管理を削除
- 所有権対象のメンバーシップにmembershipFor属性を追加
- メンバーシップインターフェースをメンバーシップとプログラムに分離
- 所有権コレクションのインデックス調整

## v2.1.1 - 2020-04-23

### Changed

- ウェブフック通知のエラーハンドリング調整

## v2.1.0 - 2020-04-22

### Changed

- 会員プログラム注文プロセスにおいて最新の会員プログラム情報を取得するように変更

## v2.0.0 - 2020-04-21

### Added

- 注文レポート作成タスクを実験的に追加
- 販売者に返品ポリシー属性を追加

### Changed

- 注文検索条件拡張
- 注文CSVレポート拡張
- update @chevre/factory
- String型の座席タイプに対応
- Array型の座席タイプに対応
- 座席タイプチャージを予約の価格要素に追加
- 座席順が異なっていてもCOA座席予約の券種を変更できるように調整
- メンバーシップ自動更新時もポイントインセンティブが付与されるように調整
- ttts予約承認を本家予約承認に合わせるように調整
- update @chevre/api-nodejs-client
- 予約の余分確保分をsubReservationとして表現するように調整
- デフォルトで確定予約へ連携する値を拡張
- デフォルトで注文識別子にconfirmationNumberとconfirmationPassを追加
- COAリクエストにタイムアウト設定
- 予約承認時のエラーハンドリングを調整
- 返品取引開始時に返品ポリシー確認を追加

### Removed

- 場所(オンラインとストア)インターフェースを削除
- プロジェクトのイベントリポジトリ使用設定を廃止
- イベントリポジトリを削除
- イベントキャパシティリポジトリを削除

### Fixed

- COAのXMLスケジュール抽出を、screener.timeが配列でない場合に対応

## v1.2.0 - 2020-01-24

### Changed

- 注文検索条件拡張

## v1.1.0 - 2020-01-24

### Added

- 組織タイプにProjectを追加
- プロジェクトメンバーリポジトリを追加
- ロールリポジトリを追加
- IAMサービスを追加

### Changed

- ユーザープロフィールを部分的に更新できるように調整
- COA管理のイベントに対しても、座席オファーと券種オファーを検索できるように調整
- 会員登録時のポイント付与において、最も古い所有口座をデフォルト口座として扱うように調整
- MongoDBの各コレクション検索条件にproject.id.$eqを追加
- mongooseのsettersを無効化
- 各リソースの正規表現検索についてcase  insensitivityを無効化

## v1.0.0 - 2019-12-26

### Added

- 口座サービスを追加
- コードサービスを追
- 配送サービスを追加
- 通知サービスを追加
- オファーサービスを追加
- 決済サービスを追加
- レポートサービスを追加
- 予約サービスを追加
- 取引サービスを追加
