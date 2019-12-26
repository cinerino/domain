const { google } = require('googleapis');

const customsearch = google.customsearch('v1');

findMovieImage({ query: 'test' })
    .then((result) => {
        console.log(result);
        console.log('success!');
    });

/**
 * Googleで作品画像を検索する
 */
async function findMovieImage(params) {
    return new Promise((resolve) => {
        customsearch.cse.list(
            {
                cx: process.env.CUSTOM_SEARCH_ENGINE_ID,
                q: params.query,
                auth: process.env.GOOGLE_API_KEY,
                num: 1,
                rights: 'cc_publicdomain cc_sharealike',
                // start: 0,
                // imgSize: 'medium',
                searchType: 'image'
            },
            (err, res) => {
                if (!(err instanceof Error)) {
                    if (typeof res.data === 'object' && Array.isArray(res.data.items) && res.data.items.length > 0) {
                        resolve(res.data.items[0].image.thumbnailLink);
                        // resolve(<string>res.data.items[0].link);

                        return;
                        // thumbnails.push({
                        //     eventId: event.id,
                        //     link: res.data.items[0].link,
                        //     thumbnailLink: res.data.items[0].image.thumbnailLink
                        // });
                    }
                }

                resolve();
            }
        );
    });
}