import { getConfig } from '../src/config.js';
import { crawlTopics } from '../src/crawler.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const config = getConfig();
const outputDir = path.resolve('public', 'data');
const topics = config.defaultTopics;
const result = await crawlTopics({
  topics,
  extraFeeds: config.extraFeeds,
  maxItemsPerTopic: config.maxItemsPerTopic,
  existingItems: []
});

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeJson(path.join(outputDir, 'topics.json'), topics),
  writeJson(path.join(outputDir, 'news.json'), result.items),
  writeJson(path.join(outputDir, 'status.json'), {
    topics,
    newsCount: result.items.length,
    cronExpression: config.cronExpression,
    maxItemsPerTopic: config.maxItemsPerTopic,
    extraFeeds: config.extraFeeds,
    isCrawling: false,
    lastReport: result.report,
    staticBuild: true
  })
]);

console.log(JSON.stringify(result.report, null, 2));

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
