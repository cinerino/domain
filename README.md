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

| Name                                   | Required | Value             | Purpose                        |
| -------------------------------------- | -------- | ----------------- | ------------------------------ |
| `DEBUG`                                | false    | cinerino-domain:* | Debug                          |
| `PROJECT_ID`                           | true     |                   | Cinerino Project ID            |
| `NODE_ENV`                             | true     |                   | Environment name               |
| `SENDGRID_API_KEY`                     | true     |                   | SendGrid API Key               |
| `LINE_NOTIFY_URL`                      | true     |                   | LINE Notify URL                |
| `DEVELOPER_LINE_NOTIFY_ACCESS_TOKEN`   | true     |                   | LINE Notify access token       |
| `AWS_ACCESS_KEY_ID`                    | true     |                   | AWS access key                 |
| `AWS_SECRET_ACCESS_KEY`                | true     |                   | AWS secret access key          |
| `COA_ENDPOINT`                         | true     |                   | COA credentilas                |
| `COA_REFRESH_TOKEN`                    | true     |                   | credentilas                    |
| `CHEVRE_AUTHORIZE_SERVER_DOMAIN`       | true     |                   | Chevre credentials             |
| `CHEVRE_CLIENT_ID`                     | true     |                   | Chevre credentials             |
| `CHEVRE_CLIENT_SECRET`                 | true     |                   | Chevre credentials             |
| `MVTK_RESERVE_AUTHORIZE_SERVER_DOMAIN` | true     |                   | Mvtk Reserve credentials       |
| `MVTK_RESERVE_CLIENT_ID`               | true     |                   | Mvtk Reserve credentials       |
| `MVTK_RESERVE_CLIENT_SECRET`           | true     |                   | Mvtk Reserve credentials       |
| `PECORINO_AUTHORIZE_SERVER_DOMAIN`     | true     |                   | Pecorino credentials           |
| `PECORINO_CLIENT_ID`                   | true     |                   | Pecorino credentials           |
| `PECORINO_CLIENT_SECRET`               | true     |                   | Pecorino credentials           |
| `TELEMETRY_API_ENDPOINT`               | true     |                   | Telemetry API endpoint         |
| `CUSTOM_SEARCH_ENGINE_ID`              | true     |                   | Google Custom Search Engine ID |
| `GOOGLE_API_KEY`                       | true     |                   | Google API Key                 |

## Code Samples

Code sample are [here](https://github.com/cinerino/domain/tree/master/example).

## License

ISC
