
const domain = require('../');
const csv = require('csvtojson');
const json2csv = require('json2csv');
const fs = require('fs');

const csvFilePath = `${__dirname}/transactions.csv`

async function main() {

    const personRepo = new domain.repository.Person({
        userPoolId: ''
    });

    const transactions = await csv().fromFile(csvFilePath);
    console.log(transactions);

    const reports = [];
    for (const transaction of transactions) {
        const people = await personRepo.search({
            id: transaction.personId
        });
        console.log(people.length, people[0].memberOf.membershipNumber, 'people found');

        reports.push({
            id: transaction.id,
            transactionNumber: transaction.transactionNumber,
            startDate: transaction.startDate,
            personId: transaction.personId,
            username: people[0].memberOf.membershipNumber
        });
    }
    // console.log(reports);
    console.log(reports.length);
    const fields = ['id', 'transactionNumber', 'startDate', 'personId', 'username'];
    const opts = { fields };

    try {
        const csv = json2csv.parse(reports, opts);
        fs.writeFileSync(`${__dirname}/usernames.csv`, csv);
    } catch (err) {
        console.error(err);
    }
}

main()
    .then(() => {
        console.log('success!');
    })
    .catch(console.error);