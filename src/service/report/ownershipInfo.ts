/**
 * 所有権レポートサービス
 */
// import * as json2csv from 'json2csv';
// @ts-ignore
import * as JSONStream from 'JSONStream';
import * as moment from 'moment';
// import { Stream } from 'stream';

import * as factory from '../../factory';

// import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';

/**
 * 所有権レポートインターフェース
 */
export interface IOwnershipInfoReport {
    id: string;
    identifier: string;
    ownedBy: {
        typeOf: string;
        id: string;
    };
    typeOfGood: {
        typeOf: string;
        id?: string;
    };
    ownedFrom: string;
    ownedThrough: string;
}

/**
 * フォーマット指定でストリーミングダウンロード
 */
// export function stream(params: {
//     conditions: factory.ownershipInfo.ISearchConditions;
//     format?: factory.chevre.encodingFormat.Application | factory.chevre.encodingFormat.Text;
// }) {
//     // tslint:disable-next-line:max-func-body-length
//     return async (repos: { ownershipInfo: OwnershipInfoRepo }): Promise<Stream> => {
//         let inputStream = repos.ownershipInfo.stream(params.conditions);
//         let processor: Stream;

//         switch (params.format) {
//             case factory.chevre.encodingFormat.Application.json:
//                 inputStream = inputStream.map((doc) => {
//                     return doc.toObject();
//                 });

//                 processor = inputStream.pipe(JSONStream.stringify());

//                 break;

//             case factory.chevre.encodingFormat.Text.csv:
//                 inputStream = inputStream.map((doc) => {
//                     return <any>JSON.stringify(ownershipInfo2report({
//                         ownershipInfo: doc.toObject()
//                     }));
//                 });

//                 const fields: json2csv.default.FieldInfo<any>[] = [
//                     { label: 'ID', default: '', value: 'id' },
//                     { label: '識別子', default: '', value: 'identifier' },
//                     { label: '所有者タイプ', default: '', value: 'ownedBy.typeOf' },
//                     { label: '所有者ID', default: '', value: 'ownedBy.id' },
//                     { label: '所有期間from', default: '', value: 'ownedFrom' },
//                     { label: '所有期間through', default: '', value: 'ownedThrough' },
//                     { label: '所有物タイプ', default: '', value: 'typeOfGood.typeOf' },
//                     { label: '所有物ID', default: '', value: 'typeOfGood.id' }
//                 ];

//                 const opts = {
//                     fields: fields,
//                     delimiter: ',',
//                     eol: '\n'
//                     // flatten: true,
//                     // preserveNewLinesInValues: true,
//                     // unwind: 'acceptedOffers'
//                 };
//                 // const json2csvParser = new json2csv.Parser(opts);
//                 const transformOpts = {
//                     highWaterMark: 16384,
//                     encoding: 'utf-8'
//                 };
//                 const transform = new json2csv.Transform(opts, transformOpts);
//                 processor = inputStream.pipe(transform);

//                 break;

//             default:
//                 inputStream = inputStream.map((doc) => {
//                     return doc.toObject();
//                 });

//                 processor = inputStream;
//         }

//         return processor;
//     };
// }

export function ownershipInfo2report(params: {
    ownershipInfo: factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood>;
}): IOwnershipInfoReport {
    const ownershipInfo = params.ownershipInfo;

    return {
        id: ownershipInfo.id,
        identifier: ownershipInfo.identifier,
        ownedBy: {
            typeOf: ownershipInfo.ownedBy.typeOf,
            id: String(ownershipInfo.ownedBy.id)
        },
        typeOfGood: {
            typeOf: ownershipInfo.typeOfGood.typeOf
        },
        ownedFrom: moment(ownershipInfo.ownedFrom)
            .toISOString(),
        ownedThrough: moment(ownershipInfo.ownedThrough)
            .toISOString()
    };
}
