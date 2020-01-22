# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Unreleased

### Added

- 組織タイプにProjectを追加
- プロジェクトメンバーリポジトリを追加
- ロールリポジトリを追加
- IAMサービスを追加

### Changed

- ユーザープロフィールを部分的に更新できるように調整
- ストリーミング検索にタイムアウトを設定
- COA管理のイベントに対しても、座席オファーと券種オファーを検索できるように調整
- 会員登録時のポイント付与において、最も古い所有口座をデフォルト口座として扱うように調整
- MongoDBの各コレクション検索条件にproject.id.$eqを追加
- mongooseのsettersとvirtualsを無効化

### Deprecated

### Removed

### Fixed

### Security

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
