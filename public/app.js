const state = {
  topics: [],
  news: [],
  activeTopic: '',
  search: '',
  staticMode: false
};

const elements = {
  topics: document.querySelector('#topics'),
  topicForm: document.querySelector('#topicForm'),
  topicInput: document.querySelector('#topicInput'),
  newsList: document.querySelector('#newsList'),
  crawlButton: document.querySelector('#crawlButton'),
  cronText: document.querySelector('#cronText'),
  newsCount: document.querySelector('#newsCount'),
  lastRun: document.querySelector('#lastRun'),
  feedTitle: document.querySelector('#feedTitle'),
  searchInput: document.querySelector('#searchInput'),
  message: document.querySelector('#message')
};

function formatDate(value) {
  if (!value) {
    return '尚未更新';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.hidden = !text;
}

function staticOnlyMessage() {
  showMessage('目前是 GitHub Pages 靜態部署：題材請到 GitHub repository 的 Settings → Secrets and variables → Actions → Variables 設定 NEWS_TOPICS，或手動執行 workflow 更新。');
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || response.statusText);
  }

  return response.json();
}

function renderTopics() {
  elements.topics.innerHTML = '';

  const allButton = document.createElement('button');
  allButton.className = `topic-chip ${state.activeTopic === '' ? 'is-active' : ''}`;
  allButton.type = 'button';
  allButton.textContent = '全部';
  allButton.addEventListener('click', () => {
    state.activeTopic = '';
    render();
  });
  elements.topics.append(allButton);

  for (const topic of state.topics) {
    const chip = document.createElement('span');
    chip.className = `topic-chip ${state.activeTopic === topic ? 'is-active' : ''}`;

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.textContent = topic;
    selectButton.addEventListener('click', () => {
      state.activeTopic = topic;
      render();
    });

    chip.append(selectButton);

    if (!state.staticMode) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.setAttribute('aria-label', `移除 ${topic}`);
      removeButton.textContent = '×';
      removeButton.addEventListener('click', async () => {
        await fetchJson(`/api/topics/${encodeURIComponent(topic)}`, { method: 'DELETE' });
        if (state.activeTopic === topic) {
          state.activeTopic = '';
        }
        await loadData();
      });
      chip.append(removeButton);
    }

    elements.topics.append(chip);
  }
}

function visibleNews() {
  const keyword = state.search.toLocaleLowerCase();
  return state.news.filter((item) => {
    const matchesTopic = !state.activeTopic || item.topic === state.activeTopic;
    const matchesKeyword = !keyword || `${item.title} ${item.summary}`.toLocaleLowerCase().includes(keyword);
    return matchesTopic && matchesKeyword;
  });
}

function renderNews() {
  const items = visibleNews();
  elements.newsList.innerHTML = '';
  elements.feedTitle.textContent = state.activeTopic ? `${state.activeTopic} 新聞` : '全部新聞';

  if (items.length === 0) {
    elements.newsList.innerHTML = '<article class="news-card"><h3>目前沒有新聞</h3><p>請按「立即更新」，或新增題材後等待每日排程爬取。</p></article>';
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'news-card';
    card.innerHTML = `
      <div class="news-meta">
        <span class="badge"></span>
        <span class="source"></span>
        <span class="date"></span>
      </div>
      <h3><a target="_blank" rel="noopener noreferrer"></a></h3>
      <p></p>
    `;

    card.querySelector('.badge').textContent = item.topic;
    card.querySelector('.source').textContent = item.source || 'RSS';
    card.querySelector('.date').textContent = formatDate(item.publishedAt);
    const link = card.querySelector('a');
    link.href = item.link || '#';
    link.textContent = item.title;
    card.querySelector('p').textContent = item.summary || '無摘要';
    elements.newsList.append(card);
  }
}

function renderStatus(status) {
  elements.cronText.textContent = status.cronExpression;
  elements.newsCount.textContent = status.newsCount;
  elements.lastRun.textContent = formatDate(status.lastReport?.crawledAt);
}

function render() {
  renderTopics();
  renderNews();
}

async function loadData() {
  try {
    const [topics, status, news] = await Promise.all([
      fetchJson('/api/topics'),
      fetchJson('/api/status'),
      fetchJson('/api/news?limit=200')
    ]);

    state.staticMode = false;
    state.topics = topics;
    state.news = news;
    renderStatus(status);
    render();
    return;
  } catch (error) {
    const [topics, status, news] = await Promise.all([
      fetchJson('data/topics.json'),
      fetchJson('data/status.json'),
      fetchJson('data/news.json')
    ]);

    state.staticMode = true;
    state.topics = topics;
    state.news = news;
    renderStatus(status);
    render();
  }
}

elements.topicForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const topic = elements.topicInput.value.trim();
  if (!topic) {
    return;
  }

  if (state.staticMode) {
    staticOnlyMessage();
    return;
  }

  await fetchJson('/api/topics', {
    method: 'POST',
    body: JSON.stringify({ topic })
  });
  elements.topicInput.value = '';
  showMessage(`已新增「${topic}」，按立即更新即可抓取。`);
  await loadData();
});

elements.crawlButton.addEventListener('click', async () => {
  if (state.staticMode) {
    staticOnlyMessage();
    return;
  }

  elements.crawlButton.disabled = true;
  elements.crawlButton.textContent = '更新中…';
  showMessage('正在抓取新聞，可能需要幾秒鐘。');

  try {
    const report = await fetchJson('/api/crawl', { method: 'POST' });
    showMessage(report.skipped ? report.reason : '新聞已更新完成。');
    await loadData();
  } catch (error) {
    showMessage(`更新失敗：${error.message}`);
  } finally {
    elements.crawlButton.disabled = false;
    elements.crawlButton.textContent = '立即更新';
  }
});

elements.searchInput.addEventListener('input', (event) => {
  state.search = event.target.value;
  renderNews();
});

loadData().catch((error) => showMessage(`載入失敗：${error.message}`));
