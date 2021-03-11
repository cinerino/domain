# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Unreleased

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## v10.16.0 - 2021-03-11

### Added

- グローバル設定に注文変更時通知設定を追加
- 注文にbrokerを追加

### Changed

- update @chevre/api-nodejs-client
- update @cinerino/factory
- プロジェクトメンバーの権限検索時にロールリストも返すように調整
- 注文取引でcustomerを指定できるように調整
- Chevre返金時にpurposeを返品アクションに指定するように調整
- Chevreエラーハンドリング強化
- 返金後メール送信を指定されなければ実行しないように調整

## v10.15.1 - 2021-02-11

### Changed

- 注文から予約への決済方法の連携に関して、決済方法区分コードがOthersの場合、名称を取り込むように調整

## v10.15.0 - 2021-01-26

### Added

- プロジェクトサービスを追加

### Changed

- 通貨転送取引を再実装
- 注文取引に対する特典口座番号を発行できるように調整
- 注文作成後の通知に注文トークンを付加
- Chevre決済中止処理のエラーハンドリングを調整
- Chevre予約の追加特性からpaymentSeatIndex,csvCode,transactionを削除
- update @chevre/api-nodejs-client
- update @cinerino/factory

## v10.14.1 - 2020-12-17

### Changed

- 所有権コレクションにユニークインデックスを追加
- インボイスコレクションにユニークインデックスを追加
- upsertを使用したクエリを実行した際の重複エラーハンドリングを追加
- オファーカテゴリーについて、オファーの追加特性参照を廃止(ttts対応)

## v10.14.0 - 2020-12-11

### Changed

- ポイント特典付与の際に、Pecorino取引に対して識別子を指定するように調整
- 注文番号の拡張性強化
- 注文取引に対して任意のタイミングで注文番号を発行できるように調整
- $setOnInsertを使用したクエリに対して{new: true}をセット

## v10.13.1 - 2020-12-04

### Changed

- 予約取引中止前に取引の存在確認処理を追加
- サービス登録取引中止前に取引の存在確認処理を追加

## v10.13.0 - 2020-12-02

### Changed

- 注文に最低限の勘定科目情報を追加

## v10.12.0 - 2020-12-02

### Changed

- プロジェクト設定からcodeExpiresInSecondsを削除
- 注文取引開始パラメータからseller.typeOfを削除
- update @chevre/factory

## v10.11.0 - 2020-11-26

### Changed

- 返品ポリシーのmerchantReturnDaysを注文返品取引に適用
- update @chevre/api-nodejs-client

## v10.10.3 - 2020-11-18

### Changed

- update @chevre/api-nodejs-client
- update @cinerino/factory

## v10.10.2 - 2020-11-18

### Changed

- 所有権検索条件拡張

## v10.10.1 - 2020-11-17

### Changed

- 所有権検索条件拡張

## v10.10.0 - 2020-11-17

### Changed

- 所有権検索条件拡張

## v10.9.0 - 2020-11-17

### Changed

- AccountプロダクトタイプをPaymentCardに統合
- 口座注文時に、口座にアクセスコードを設定

## v10.8.0 - 2020-11-13

### Changed

- ペイメントカード決済処理をChevre決済取引に統合

## v10.7.0 - 2020-11-12

### Added

- 注文取引に確認番号を保管するサービスを追加

### Changed

- update @chevre/api-nodejs-client
- 注文取引に保管された確認番号を注文へ反映するように調整
- MovieTicket系統決済取引開始時に、注文確認番号を連携するように調整
- アクション検索条件拡張

### Removed

- 注文取引確定時の確認番号カスタム指定を削除

## v10.6.2 - 2020-11-06

### Changed

- update @chevre/api-nodejs-client

## v10.6.1 - 2020-11-06

### Changed

- update @pecorino/api-nodejs-client
- update @cinerino/factory

## v10.6.0 - 2020-11-04

### Changed

- 外部決済サービス認証情報をプロダクト検索から取得するように調整
- update @chevre/api-nodejs-client
- update @motionpicture/gmo-service
- update @pecorino/api-nodejs-client

### Removed

- 管理者としての口座開設サービスを削除

## v10.5.0 - 2020-10-23

### Changed

- 取引検索条件拡張

## v10.4.1 - 2020-10-22

### Changed

- COAでの予約処理において、ムビチケあるいはMGを利用した予約かどうかの判定を、mvtkAppPriceからmvtkNumに変更

## v10.4.0 - 2020-10-21

### Changed

- コード発行を複数objectに対応
- コードのトークン化の際にプロジェクト指定を必須に変更
- アクション検索条件拡張
- トークン検証をアクションリポジトリへの連動なしでも実行できるように調整

## v10.3.0 - 2020-10-15

### Changed

- コード発行時にexpiresInSecondsを明示的に指定できるように調整

## v10.2.2 - 2020-10-15

### Changed

- order.identifier.paymentNoにconfirmationNumberを設定

## v10.2.1 - 2020-10-14

### Changed

- ttts専用paymentNoをorder.identifierから削除

## v10.2.0 - 2020-10-12

### Changed

- update @chevre/factory

## v10.1.0 - 2020-10-06

### Added

- タスクリポジトリにsaveManyを実装

## v10.0.0 - 2020-10-06

### Changed

- 注文アイテムとしてのCOA予約生成処理を仮予約時に移動
- 注文アイテムとしてのCOA予約を最適化
- 予約オファー承認アクションを最適化

### Deprecated

### Removed

- 口座入金サービスを削除
- 口座決済サービスを削除

## v9.4.1 - 2020-10-01

### Changed

- 注文を最適化

## v9.4.0 - 2020-09-30

### Changed

- factory.chevre.paymentMethodType.Accountへの依存を排除
- Chevre決済サービスを口座決済に対応
- 所有権のownedByを最適化
- 所有権のacquiredFromを最適化

## v9.3.0 - 2020-09-24

### Changed

- update @chevre/api-nodejs-client
- update @cinerino/factory
- update @pecorino/api-nodejs-client

## v9.2.0 - 2020-09-23

### Changed

- update @motionpicture/coa-service
- COA予約承認処理をMGチケットに対応
- 口座決済返金時のtoLocationのタイプをAccountに変更

## v9.1.0 - 2020-09-18

### Changed

- update @chevre/api-nodejs-client
- update @cinerino/factory
- update @pecorino/api-nodejs-client
- ポイント口座での決済取引開始時のfromLocationのタイプをAccountに変更
- メンバーシップ注文取引のcustomerを最適化
- メンバーシップ注文タスクのagentを最適化
- メンバーシップ注文タスクのagentの追加特性を注文取引に反映するように調整

## v9.0.0 - 2020-09-15

### Changed

- 所有権インターフェースの汎用性拡張
- Chevre転送取引へのignorePaymentCard指定を削除
- CancelSeatReservationタスクをVoidReserveタスクに変更

### Removed

- クレジットカード決済サービスを削除
- ムビチケ決済サービスを削除
- ムビチケリポジトリを削除
- mvtkreserveapiのエクスポートを削除

## v8.20.0 - 2020-09-12

### Changed

- SendGrid設定に関して、プロセスレベルでの設定とプロジェクトレベルでの設定を両方有効化

## v8.19.0 - 2020-09-10

### Changed

- @chevre/factoryと重複するインターフェースを最適化

## v8.18.0 - 2020-09-10

### Removed

- RegisterProgramMembershipタスクを削除

## v8.17.0 - 2020-09-09

### Changed

- update @chevre/api-nodejs-client

## v8.16.0 - 2020-09-09

### Changed

- update @chevre/api-nodejs-client

## v8.15.0 - 2020-09-08

### Added

- USE_CHEVRE_PAY_MOVIE_TICKET設定を追加

### Changed

- Chevre返金処理をクレジットカード以外の決済方法に対応
- オファーの適用ムビチケ条件の決済方法として、appliesToMovieTicket.serviceOutput.typeOfを参照するように変更
- 注文取引確定時のムビチケ系統決済に対する検証処理を、利用可能なムビチケ系統決済方法タイプに対して動的に実行するように調整
- プロジェクトごとの管理者ユーザープール管理を統合

## v8.14.0 - 2020-09-01

### Added

- USE_CHEVRE_REFUND_CREDIT_CARD設定を追加
- USE_CHEVRE_PAY_CREDIT_CARD設定を追加

### Changed

- 決済承認処理をChevre決済に対応
- 決済処理をChevre決済に対応
- 決済中止処理をChevre決済に対応
- Chevre,Pecorino,MovieticketReserveの400エラーハンドリングを調整

## v8.13.0 - 2020-08-28

### Changed

- 注文後の個別決済アクションを汎用決済アクションに変更
- 注文返品後の個別返金アクションを汎用返金アクションに変更
- 決済アクションを最適化
- 注文後の決済アクション作成処理を汎用化
- 注文返品後の返金アクション作成処理を汎用化
- 決済方法タイプに依存するジェネリック型を削除
- プロジェクト設定からGMO情報を削除
- 販売者の対応決済方法インターフェースの汎用性拡張

### Removed

- 個別決済タスクを削除
- 個別決済中止タスクを削除
- 個別返金タスクを削除

## v8.12.0 - 2020-08-23

### Added

- 汎用返金タスクを追加

## v8.11.0 - 2020-08-23

### Added

- 汎用決済中止タスクを追加

### Changed

- 口座決済タスクを汎用決済タスクに変更
- ペイメントカード決済タスクを汎用決済タスクに変更

## v8.10.0 - 2020-08-21

### Changed

- ムビチケ決済タスクを汎用決済タスクに変更

## v8.9.0 - 2020-08-21

### Changed

- クレジットカード決済タスクを汎用決済タスクに変更

## v8.8.0 - 2020-08-20

### Changed

- 決済承認アクションのinstrumentを決済アクションに連携

## v8.7.1 - 2020-08-20

### Changed

- 決済承認アクションのinstrumentを決済サービスとして定義

## v8.7.0 - 2020-08-20

### Changed

- 決済承認アクションのinstrumentを決済サービスとして定義
- 決済承認アクションのobject.typeOfを'Payment'に統一

## v8.6.1 - 2020-08-19

### Changed

- 注文取引確定時の決済承認リストが承認アクションのobject.typeOfに依存しないように調整

## v8.6.0 - 2020-08-19

### Changed

- 注文取引確定時の決済承認リストが静的な決済方法管理に依存しないように調整
- 注文取引確定時の決済承認リストが承認アクションのobject.typeOfに依存しないように調整
- アクションコレクションインデックス調整

## v8.5.0 - 2020-08-19

### Changed

- 決済承認アクションにresult.typeOfを追加

## v8.4.0 - 2020-08-19

### Changed

- 決済承認アクションにobject.paymentMethodを追加

## v8.3.1 - 2020-08-04

### Removed

- 不要なイベント検索ファンクションを削除

## v8.3.0 - 2020-08-03

### Changed

- update @cinerino/factory
- update @chevre/api-nodejs-client

## v8.2.0 - 2020-07-19

### Changed

- GMOオーダーIDをChevre取引番号に変更

### Removed

- USE_SEPARATE_MOVIE_TICKET_PAYMENT設定を削除

## v8.1.0 - 2020-07-17

### Added

- USE_SEPARATE_MOVIE_TICKET_PAYMENT設定を追加

### Changed

- ttts専用paymentNoをconfirmationNumberに統合

## v8.0.1 - 2020-07-15

### Changed

- update @cinerino/factory
- update @chevre/api-nodejs-client

## v8.0.0 - 2020-07-15

### Changed

- 販売者リポジトリをChevreへ移行

## v7.14.4 - 2020-07-14

### Changed

- update @cinerino/factory
- update @chevre/api-nodejs-client

## v7.14.3 - 2020-07-13

### Changed

- ムビチケ決済処理を細分化
- COA仮予約時のエラーハンドリングを強化

## v7.14.2 - 2020-07-11

### Changed

- Eメール送信時にSendGridへユニーク引数を追加

## v7.14.1 - 2020-07-10

### Changed

- update @cinerino/factory

## v7.14.0 - 2020-07-10

### Changed

- update @chevre/api-nodejs-client
- update @cinerino/factory
- オファーと価格仕様のappliesToMovieTicketType→appliesToMovieTicket対応
- ムビチケ系統決済処理をMGTicketに対応
- ムビチケサービスエンドポイント設定をChevreへ移行

## v7.13.0 - 2020-07-08

### Changed

- update @cinerino/factory

## v7.12.0 - 2020-07-06

### Changed

- Chevreエンドポイントを環境変数として設定するように変更
- Pecorinoエンドポイントを環境変数として設定するように変更

## v7.11.2 - 2020-07-04

### Changed

- プロダクトオファー検索に販売期間の検証を追加

## v7.11.1 - 2020-07-04

### Changed

- メンバーシップと口座オファー検索時に販売者とアプリケーションを検証するように調整

## v7.11.0 - 2020-07-03

### Added

- プロダクトオファー承認時に利用アプリケーションの検証を追加
- プロダクトオファー承認時に販売者の検証を追加
- プロダクトオファー検索に販売者の検証を追加

### Changed

- 口座注文進行時に、プロダクトオファーから販売者を自動選択するように調整

## v7.10.0 - 2020-07-01

### Changed

- update @cinerino/factory
- update @chevre/api-nodejs-client

## v7.9.0 - 2020-06-29

### Added

- プロダクトオファー検索処理を追加

## v7.8.0 - 2020-06-29

### Changed

- メンバーシップ注文処理中のクレジットカード決済に関して、クライアントエラーであればリトライしないように調整

## v7.7.0 - 2020-06-28

### Changed

- 口座開設を口座注文処理へ完全移行
- 所有権インターフェース汎用性拡張

## v7.6.0 - 2020-06-27

### Added

- サービス登録中止タスクを追加

## v7.5.0 - 2020-06-27

### Added

- サービス登録中止タスクを追加

## v7.4.0 - 2020-06-27

### Changed

- メンバーシップと口座注文時に確認番号を発行するように調整

## v7.3.0 - 2020-06-26

### Added

- 所有権検索条件拡張
- COA予約にbookingTime属性を追加

## v7.2.3 - 2020-06-25

### Changed

- update @cinerino/factory

## v7.2.2 - 2020-06-25

### Added

- プロダクトタイプにAccountを追加

## v7.2.1 - 2020-06-25

### Added

- プロダクトタイプにAccountを追加

## v7.2.0 - 2020-06-24

### Added

- プロダクトタイプにAccountを追加

## v7.1.0 - 2020-06-24

### Added

- アクション検索条件拡張

## v7.0.0 - 2020-06-24

### Changed

- 口座番号をChevreで発行するように調整

## v6.2.0 - 2020-06-24

### Changed

- プロダクト識別子をChevreで発行するように調整

## v6.1.0 - 2020-06-23

### Changed

- メンバーシップサービスをプロダクトサービスに統合

## v6.0.0 - 2020-06-23

### Changed

- プロダクトオファー承認にポイント特典を指定できるように調整
- メンバーシップ登録を汎用的なサービス登録へ移行
- 会員削除後のメンバーシップ所有権期限変更処理を削除
- 注文検索条件拡張

## v5.8.0 - 2020-06-21

### Added

- プロダクトオファー承認取消処理を追加

## v5.7.0 - 2020-06-21

### Changed

- プロダクトオファー承認に対してサービス登録排他ロック処理を追加

## v5.6.0 - 2020-06-21

### Added

- USE_AUTHORIZE_PRODUCT_OFFER設定を追加

## v5.5.0 - 2020-06-20

### Changed

- メンバーシップ注文配送処理をプロダクト注文配送処理に統合
- update @cinerino/factory

## v5.4.0 - 2020-06-19

### Added

- ProductTypeをenumとして定義

## v5.3.0 - 2020-06-19

### Changed

- update @cinerino/factory
- update @chevre/api-nodejs-client
- メンバーシップ登録時のポイント特典をChevreで処理するように調整
- メンバーシップ注文処理をメンバーシップサービスから分離
- メンバーシップ登録ロックホルダーを注文取引IDに変更
- メンバーシップ登録ロックのタイミングをサービス登録取引開始前へ移行
- メンバーシップ注文失敗時に、メンバーシップオファー承認を明示的に取り消すように調整
- 注文アイテムを複数のプロダクト対応に対応

## v5.2.0 - 2020-06-15

### Changed

- メンバーシップの注文取引をChevreサービス登録取引に連携
- update packages

## v5.1.1 - 2020-06-09

### Changed

- メンバーシップサービスのserviceOutputがarrayでない場合に対応

## v5.1.0 - 2020-06-02

### Added

- 注文アイテムに決済カードを追加
- 通貨転送取引番号リポジトリを追加
- プロジェクトに返金通知設定を追加

### Changed

- 金額オファー承認をChevre通貨転送取引連携へ変更
- Pecorino取引に対して取引番号を指定するように調整
- ポイント決済を出金取引へ変更
- ポイント付与処理と管理者入金処理をChevre通貨転送取引へ変更
- 口座決済処理をChevre通貨転送取引へ変更
- Chevre予約取引に対して取引番号を事前に発行するように調整
- 予約取引を取引番号でステータス変更するように調整
- 注文返品取引オブジェクトを最適化
- 予約取消タスクを予約番号で処理するように変更
- 予約取消タスクを注文データから作成するように調整
- 返金アクションのオブジェクトを決済方法に変更
- 返品取引を複数注文に対応

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
