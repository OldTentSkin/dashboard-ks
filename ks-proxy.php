<?php
/**
 * ks-proxy.php — RSS proxy pro Dashboard K-S
 * Nahrát na: dashboard.bohemianworms.com/ks-proxy.php
 *
 * Použití: ks-proxy.php?url=https://...
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$cacheDir  = __DIR__ . '/data/ks-rss-cache/';
$cacheTime = 1800; // 30 minut

$url = trim($_GET['url'] ?? '');

if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Neplatná URL']);
    exit;
}

// Pouze HTTP/HTTPS
if (!preg_match('/^https?:\/\//i', $url)) {
    http_response_code(400);
    echo json_encode(['error' => 'Povoleny pouze HTTP/HTTPS URL']);
    exit;
}

// Cache soubor
if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);
$cacheFile = $cacheDir . md5($url) . '.json';

// Vrátit z cache
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTime) {
    echo file_get_contents($cacheFile);
    exit;
}

// Stáhnout feed
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 RSS Reader (Dashboard K-S)',
    CURLOPT_SSL_VERIFYPEER => false,
]);
$xml      = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if (!$xml || $httpCode !== 200) {
    http_response_code(502);
    echo json_encode(['error' => "Feed nedostupný (HTTP $httpCode)"]);
    exit;
}

// Parsovat XML
libxml_use_internal_errors(true);
$doc = simplexml_load_string($xml);
if (!$doc) {
    http_response_code(422);
    echo json_encode(['error' => 'Neplatný RSS/Atom formát']);
    exit;
}

$articles = [];

// RSS 2.0
$items = $doc->channel->item ?? [];

// Atom
if (empty($items)) {
    $doc->registerXPathNamespace('atom', 'http://www.w3.org/2005/Atom');
    $items = $doc->xpath('//atom:entry') ?: [];
}

foreach ($items as $item) {
    $title = trim((string)($item->title ?? ''));
    if (!$title) continue;

    $link = trim((string)($item->link ?? ''));
    if (!$link) {
        foreach ($item->link ?? [] as $l) {
            $attrs = $l->attributes();
            if ((string)($attrs['rel'] ?? 'alternate') === 'alternate' || !isset($attrs['rel'])) {
                $link = (string)($attrs['href'] ?? '');
                break;
            }
        }
    }
    if (!$link) continue;

    $dateStr   = (string)($item->pubDate ?? $item->published ?? $item->updated ?? '');
    $timestamp = $dateStr ? strtotime($dateStr) : time();
    if (!$timestamp) $timestamp = time();

    $desc = strip_tags((string)($item->description ?? $item->summary ?? $item->content ?? ''));
    $desc = preg_replace('/\s+/', ' ', trim($desc));
    if (mb_strlen($desc) > 150) $desc = mb_substr($desc, 0, 147) . '...';

    $articles[] = [
        'title'     => html_entity_decode($title, ENT_QUOTES | ENT_XML1, 'UTF-8'),
        'url'       => $link,
        'timestamp' => $timestamp,
        'date'      => date('j.n. H:i', $timestamp),
        'desc'      => $desc,
    ];

    if (count($articles) >= 20) break;
}

// Seřadit
usort($articles, fn($a, $b) => $b['timestamp'] - $a['timestamp']);

$result = json_encode(['ok' => true, 'articles' => $articles, 'cached' => false]);
file_put_contents($cacheFile, $result);
echo $result;
