import { getConfig } from '../src/config.js';
import { crawlTopics } from '../src/crawler.js';
import { getNews, getTopics, saveNews } from '../src/store.js';

const config = getConfig();
const topics = await getTopics(config.defaultTopics);
const existingItems = await getNews();
const result = await crawlTopics({
  topics,
  extraFeeds: config.extraFeeds,
  maxItemsPerTopic: config.maxItemsPerTopic,
  existingItems
});

await saveNews(result.items);
console.log(JSON.stringify(result.report, null, 2));
