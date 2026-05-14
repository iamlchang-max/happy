import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { crawlTopics } from './crawler.js';
import { addTopic, getNews, getTopics, removeTopic, saveNews } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const config = getConfig();
let lastReport = null;
let isCrawling = false;

async function runCrawl() {
  if (isCrawling) {
    return { skipped: true, reason: 'crawler is already running' };
  }

  isCrawling = true;
  try {
    const topics = await getTopics(config.defaultTopics);
    const existingItems = await getNews();
    const result = await crawlTopics({
      topics,
      extraFeeds: config.extraFeeds,
      maxItemsPerTopic: config.maxItemsPerTopic,
      existingItems
    });

    await saveNews(result.items);
    lastReport = result.report;
    return result.report;
  } finally {
    isCrawling = false;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function contentType(filePath) {
  const extension = path.extname(filePath);
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  }[extension] || 'application/octet-stream';
}

async function serveStatic(pathname, response) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: 'forbidden' });
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    response.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(response, 404, { error: 'not found' });
      return;
    }

    throw error;
  }
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/status') {
    const [topics, news] = await Promise.all([getTopics(config.defaultTopics), getNews()]);
    sendJson(response, 200, {
      topics,
      newsCount: news.length,
      cronExpression: config.cronExpression,
      maxItemsPerTopic: config.maxItemsPerTopic,
      extraFeeds: config.extraFeeds,
      isCrawling,
      lastReport
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/topics') {
    sendJson(response, 200, await getTopics(config.defaultTopics));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/topics') {
    const body = await readBody(request);
    const topic = String(body.topic || '').trim();
    if (!topic) {
      sendJson(response, 400, { error: 'topic is required' });
      return;
    }

    sendJson(response, 201, await addTopic(topic, config.defaultTopics));
    return;
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/topics/')) {
    const topic = decodeURIComponent(url.pathname.replace('/api/topics/', ''));
    sendJson(response, 200, await removeTopic(topic, config.defaultTopics));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/news') {
    const topic = String(url.searchParams.get('topic') || '').trim();
    const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
    const news = await getNews();
    const filteredNews = topic ? news.filter((item) => item.topic === topic) : news;
    sendJson(response, 200, filteredNews.slice(0, limit));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/crawl') {
    sendJson(response, 200, await runCrawl());
    return;
  }

  sendJson(response, 404, { error: 'not found' });
}

function scheduleDailyCrawl(cronExpression) {
  const [minuteValue, hourValue] = cronExpression.split(' ');
  const minute = Number.parseInt(minuteValue, 10);
  const hour = Number.parseInt(hourValue, 10);

  if (Number.isNaN(minute) || Number.isNaN(hour)) {
    console.warn(`Unsupported NEWS_CRON "${cronExpression}"; scheduler disabled.`);
    return;
  }

  setInterval(() => {
    const now = new Date();
    if (now.getMinutes() === minute && now.getHours() === hour) {
      runCrawl().catch((error) => console.error('Scheduled crawl failed:', error));
    }
  }, 60 * 1000);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message });
  }
});

scheduleDailyCrawl(config.cronExpression);

if (config.runOnStart) {
  runCrawl().catch((error) => console.error('Startup crawl failed:', error));
}

server.listen(config.port, () => {
  console.log(`Daily News Radar listening on http://localhost:${config.port}`);
  console.log(`Daily crawl schedule: ${config.cronExpression}`);
});

export { runCrawl, server };
