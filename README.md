# Cinerino Domain Library for Node.js

[![npm (scoped)](https://img.shields.io/npm/v/@cinerino/domain.svg)](https://www.npmjs.com/package/@cinerino/domain)
[![CircleCI](https://circleci.com/gh/cinerino/domain.svg?style=svg)](https://circleci.com/gh/cinerino/domain)
[![Coverage Status](https://coveralls.io/repos/github/cinerino/domain/badge.svg?branch=master)](https://coveralls.io/github/cinerino/domain?branch=master)
[![Dependency Status](https://img.shields.io/david/cinerino/domain.svg)](https://david-dm.org/cinerino/domain)
[![Known Vulnerabilities](https://snyk.io/test/github/cinerino/domain/badge.svg)](https://snyk.io/test/github/cinerino/domain)
[![npm](https://img.shields.io/npm/dm/@cinerino/domain.svg)](https://nodei.co/npm/@cinerino/domain/)

Cinerinoのバックエンド処理をNode.jsで実装するための、サーバーサイド向けパッケージです。

## Table of contents

* [Usage](#usage)
* [Code Samples](#code-samples)
* [License](#license)

## Usage

```shell
npm install @cinerino/domain
```

### Environment variables

| Name                                 | Required | Value             | Purpose                         |
| ------------------------------------ | -------- | ----------------- | ------------------------------- |
| `DEBUG`                              | false    | cinerino-domain:* | Debug                           |
| `PROJECT_ID`                         | true     |                   | CinerinoプロジェクトID          |
| `NODE_ENV`                           | true     |                   | 環境名                          |
| `MONGOLAB_URI`                       | true     |                   | MongoDB connection URI          |
| `SENDGRID_API_KEY`                   | true     |                   | SendGrid API Key                |
| `LINE_NOTIFY_URL`                    | true     |                   | LINE Notify URL                 |
| `DEVELOPER_LINE_NOTIFY_ACCESS_TOKEN` | true     |                   | LINE Notify アクセストークン    |
| `GMO_ENDPOINT`                       | true     |                   | GMO API エンドポイント          |
| `GMO_SITE_ID`                        | true     |                   | GMO サイトID                    |
| `GMO_SITE_PASS`                      | true     |                   | GMO サイトパス                  |
| `WAITER_SECRET`                      | true     |                   | WAITER許可証トークン秘密鍵      |
| `WAITER_PASSPORT_ISSUER`             | true     |                   | WAITER許可証発行者              |
| `COA_ENDPOINT`                       | true     |                   | COAサービスエンドポイント       |
| `COA_REFRESH_TOKEN`                  | true     |                   | COAサービスリフレッシュトークン |
| `ORDER_INQUIRY_ENDPOINT`             | true     |                   | 注文照会エンドポイント          |
| `TELEMETRY_API_ENDPOINT`             | true     |                   | Telemetry API エンドポイント    |
| `CUSTOM_SEARCH_ENGINE_ID`            | true     |                   | Googleカスタム検索エンジンID    |
| `GOOGLE_API_KEY`                     | true     |                   | Google API Key                  |

## Code Samples

Code sample are [here](https://github.com/cinerino/domain/tree/master/example).

## License

ISC
