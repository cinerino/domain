# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Unreleased

### Added

### Changed

- 注文検索条件拡張
- 注文CSVレポート拡張
- update @chevre/factory
- String型のseatingTypeに対応
- 座席タイプチャージを予約の価格要素に追加
- 座席順が異なっていてもCOA座席予約の券種を変更できるように調整
- メンバーシップ自動更新時もポイントインセンティブが付与されるように調整

### Deprecated

### Removed

### Fixed

### Security

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
