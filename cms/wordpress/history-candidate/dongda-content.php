<?php
/**
 * Plugin Name: DongDa Structured Content
 * Description: Private multilingual catalog editing and validated static releases.
 * Version: 2026.10.09.3
 * Requires at least: 6.4
 * Requires PHP: 8.3
 */
if (!defined('ABSPATH')) { exit; }

function dd_content_seed() { static $seed; if (!$seed) { $seed = require __DIR__ . '/seed.php'; } return $seed; }
function dd_content_name($kind, $data) {
    if ($kind === 'company-profile') { return $data['copy']['ab_h1']['zh']; }
    if ($kind === 'history') { return $data['year'] . ' - ' . $data['title']['zh']; }
    if ($kind === 'resource-field') { return $data['label']['zh']; }
    return in_array($kind, ['insight', 'resource'], true) ? $data['title']['zh'] : $data['name']['zh'];
}
function dd_content_limit($kind, $field) {
    if ($kind === 'company-profile') {
        if (preg_match('/^copy\.(ab_body|company_atlas_p)\./', $field) || preg_match('/^pillars\.\d+\.desc\./', $field)) { return 1000; }
        if (preg_match('/^copy\.(ab_sub|journey_[1-4]_p)\./', $field) || str_starts_with($field, 'capabilities.')) { return 600; }
        if (str_starts_with($field, 'copy.panorama_cap.')) { return 300; }
        return 120;
    }
    if (in_array($kind, ['resource', 'resource-field'], true)) { return 800; }
    if ($kind === 'insight') {
        if (str_starts_with($field, 'summary.')) { return 500; }
        if (str_starts_with($field, 'sections.') && str_contains($field, '.body.')) { return 2000; }
        if (str_starts_with($field, 'faq.')) { return str_contains($field, '.question.') ? 200 : 1000; }
        return 160;
    }
    return str_starts_with($field, 'name.') || str_starts_with($field, 'title.') || str_contains($field, '.title.') ? 120 : (str_starts_with($field, 'specs.') ? 400 : 600);
}
function dd_content_error($code, $message, $status = 400) { return new WP_Error($code, $message, ['status' => $status]); }
function dd_content_roles() {
    add_role('dd_content_author', 'DongDa 内容作者', ['read' => true, 'dd_edit_content' => true]);
    add_role('dd_content_reviewer', 'DongDa 内容审核', ['read' => true, 'dd_edit_content' => true, 'dd_review_content' => true]);
    add_role('dd_content_exporter', 'DongDa 只读导出', ['read' => true, 'dd_export_content' => true]);
    foreach (['dd_edit_content', 'dd_review_content', 'dd_export_content'] as $cap) { get_role('administrator')->add_cap($cap); }
}
register_activation_hook(__FILE__, 'dd_content_roles');
add_action('init', function () {
    register_post_type('dd_content', ['public' => false, 'show_ui' => false, 'show_in_rest' => false, 'supports' => ['title', 'custom-fields', 'revisions'], 'rewrite' => false]);
    register_post_meta('dd_content', '_dd_payload', ['type' => 'string', 'single' => true, 'show_in_rest' => false, 'revisions_enabled' => true]);
});
function dd_content_record($post) {
    return ['postId' => (int) $post->ID, 'kind' => get_post_meta($post->ID, '_dd_kind', true), 'id' => get_post_meta($post->ID, '_dd_id', true),
        'data' => json_decode(get_post_meta($post->ID, '_dd_payload', true), true), 'baselineHash' => get_post_meta($post->ID, '_dd_baseline', true),
        'status' => $post->post_status, 'revision' => (int) get_post_meta($post->ID, '_dd_version', true), 'modifiedAt' => $post->post_modified_gmt . 'Z'];
}
function dd_content_posts($scope) {
    $limit = count(dd_content_seed()['records']);
    $posts = get_posts(['post_type' => 'dd_content', 'post_status' => $scope === 'published' ? ['publish'] : ['publish', 'draft', 'pending'], 'posts_per_page' => $limit + 1, 'orderby' => 'ID', 'order' => 'ASC']);
    if (count($posts) > $limit) { return dd_content_error('dd_mapping', '内容数量超出注册范围，请审核迁移。', 409); }
    $seen = [];
    foreach ($posts as $post) {
        $definition = dd_content_definition($post);
        if (!$definition || isset($seen[$definition['kind'] . '/' . $definition['id']]) || $definition['baselineHash'] !== get_post_meta($post->ID, '_dd_baseline', true)) { return dd_content_error('dd_mapping', '内容映射重复、未知或基线已变更，请审核迁移。', 409); }
        $seen[$definition['kind'] . '/' . $definition['id']] = true;
    }
    return $posts;
}
function dd_content_definition($post) {
    $key = get_post_meta($post->ID, '_dd_kind', true) . '/' . get_post_meta($post->ID, '_dd_id', true);
    foreach (dd_content_seed()['records'] as $record) { if ($record['kind'] . '/' . $record['id'] === $key) { return $record; } }
    return null;
}
function dd_content_get_path($data, $path) { foreach (explode('.', $path) as $key) { if (!isset($data[$key])) { return null; } $data = $data[$key]; } return $data; }
function dd_content_set_path(&$data, $path, $value) {
    $parts = explode('.', $path); $target = &$data;
    foreach (array_slice($parts, 0, -1) as $key) { $target = &$target[$key]; }
    $target[end($parts)] = $value;
}
function dd_content_fields($definition, $fields) {
    if (!is_array($fields) || count($fields) !== count($definition['editable']) || array_diff(array_keys($fields), $definition['editable'])) { return dd_content_error('dd_fields', '字段集合不完整或包含不可编辑字段。'); }
    $data = $definition['data'];
    foreach ($definition['editable'] as $field) {
        $value = $fields[$field];
        $limit = dd_content_limit($definition['kind'], $field);
        $invalid = in_array($definition['kind'], ['company-profile', 'insight', 'resource', 'resource-field'], true) ? '/[<>\x00-\x1f\x7f]/u' : '/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/u';
        if (!is_string($value) || !trim($value) || strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')) > $limit * 2 || preg_match($invalid, $value)) { return dd_content_error('dd_text', '请填写有效纯文字，不能包含HTML或超出长度。'); }
        dd_content_set_path($data, $field, trim($value));
    }
    return $data;
}
function dd_content_save($request) {
    global $wpdb;
    $post = get_post((int) $request['postId']); $params = $request->get_json_params();
    if (!is_array($params) || array_is_list($params) || array_diff(array_keys($params), ['action', 'expectedRevision', 'fields', 'revisionId'])) { return dd_content_error('dd_params', '请求包含无效字段。'); }
    if (!$post || $post->post_type !== 'dd_content') { return dd_content_error('dd_missing', '内容不存在。', 404); }
    $action = $params['action'] ?? ''; $reviewer = current_user_can('dd_review_content');
    if (!in_array($action, ['draft', 'pending', 'publish', 'restore'], true) || (!$reviewer && ($post->post_status === 'publish' || in_array($action, ['publish', 'restore'], true)))) { return dd_content_error('dd_permission', '需要内容审核权限。', 403); }
    $definition = dd_content_definition($post);
    if (!$definition || $definition['baselineHash'] !== get_post_meta($post->ID, '_dd_baseline', true)) { return dd_content_error('dd_baseline', '内容基线已变更，请先审核迁移。', 409); }
    if ($action === 'restore') {
        $revision_id = (int) ($params['revisionId'] ?? 0);
        $revision = wp_get_post_revision($revision_id);
        if (!$revision || (int) $revision->post_parent !== (int) $post->ID) { return dd_content_error('dd_revision', '修订不属于这项内容。'); }
        $old = json_decode(get_post_meta($revision->ID, '_dd_payload', true), true); $fields = [];
        foreach ($definition['editable'] as $field) { $fields[$field] = dd_content_get_path($old, $field); }
    } else { $fields = $params['fields'] ?? null; }
    $data = dd_content_fields($definition, $fields); if (is_wp_error($data)) { return $data; }
    $version = $params['expectedRevision'] ?? null;
    if (!is_int($version) || $version < 1) { return dd_content_error('dd_revision', '缺少当前修订号。'); }
    $wpdb->query('START TRANSACTION');
    try {
        if (!update_post_meta($post->ID, '_dd_version', $version + 1, $version)) { $wpdb->query('ROLLBACK'); return dd_content_error('dd_conflict', '内容已被其他人更新，当前草稿未覆盖，请重新载入。', 409); }
        // Save the previous metadata revision before committing the new payload.
        wp_save_post_revision($post->ID);
        update_post_meta($post->ID, '_dd_payload', wp_slash(wp_json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));
        $result = wp_update_post(['ID' => $post->ID, 'post_title' => dd_content_name($definition['kind'], $data), 'post_status' => $action === 'restore' ? $post->post_status : $action], true);
        if (is_wp_error($result)) { throw new RuntimeException('Content save failed'); }
        wp_save_post_revision($post->ID);
        $wpdb->query('COMMIT'); clean_post_cache($post->ID);
    } catch (Throwable $error) { $wpdb->query('ROLLBACK'); clean_post_cache($post->ID); return dd_content_error('dd_save', '保存失败，内容未提交。', 500); }
    return dd_content_record(get_post($post->ID));
}
function dd_content_bridge($request) {
    $params = $request->get_json_params(); $action = $params['action'] ?? '';
    if (!in_array($action, ['status', 'build', 'activate', 'rollback', 'preview'], true)) { return dd_content_error('dd_action', '未知发布动作。'); }
    if (($action === 'build' && ($params['scope'] ?? '') !== 'preview') || in_array($action, ['activate', 'rollback'], true)) {
        if (!current_user_can('dd_review_content')) { return dd_content_error('dd_permission', '需要内容审核权限。', 403); }
    }
    if (!defined('DONGDA_CMS_BRIDGE_URL') || !defined('DONGDA_CMS_BRIDGE_KEY') || strlen(DONGDA_CMS_BRIDGE_KEY) < 32) { return dd_content_error('dd_unconfigured', '发布服务未配置。', 503); }
    $url = DONGDA_CMS_BRIDGE_URL;
    if (!str_starts_with($url, 'https://') && !(wp_get_environment_type() === 'local' && $url === 'http://host.docker.internal:4193')) { return dd_content_error('dd_tls', '发布服务必须使用HTTPS。', 503); }
    $params['actor'] = (string) get_current_user_id();
    $response = wp_remote_post($url . '/api/cms', ['timeout' => 120, 'redirection' => 0, 'headers' => ['Authorization' => 'Bearer ' . DONGDA_CMS_BRIDGE_KEY, 'Content-Type' => 'application/json'], 'body' => wp_json_encode($params)]);
    if (is_wp_error($response)) { return dd_content_error('dd_gateway', '发布服务响应超时，请刷新并核对当前版本。', 502); }
    $body = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($body)) { return dd_content_error('dd_gateway', '发布服务响应无效。', 502); }
    return new WP_REST_Response($body, wp_remote_retrieve_response_code($response));
}
add_action('rest_api_init', function () {
    register_rest_route('dongda/v1', '/records', ['methods' => 'GET', 'permission_callback' => fn() => current_user_can('dd_edit_content'), 'callback' => function () {
        $posts = dd_content_posts('preview'); if (is_wp_error($posts)) { return $posts; }
        return ['records' => array_map(function ($post) { $record = dd_content_record($post); $record['editable'] = dd_content_definition($post)['editable']; return $record; }, $posts), 'reviewer' => current_user_can('dd_review_content')];
    }]);
    register_rest_route('dongda/v1', '/records/(?P<postId>\d+)', ['methods' => 'POST', 'permission_callback' => fn() => current_user_can('dd_edit_content'), 'callback' => 'dd_content_save']);
    register_rest_route('dongda/v1', '/records/(?P<postId>\d+)/revisions', ['methods' => 'GET', 'permission_callback' => fn() => current_user_can('dd_review_content'), 'callback' => function ($request) {
        $post = get_post((int) $request['postId']); if (!$post || $post->post_type !== 'dd_content') { return dd_content_error('dd_missing', '内容不存在。', 404); }
        return array_values(array_map(fn($revision) => ['id' => $revision->ID, 'date' => $revision->post_modified_gmt . 'Z', 'data' => json_decode(get_post_meta($revision->ID, '_dd_payload', true), true)], wp_get_post_revisions($post->ID, ['posts_per_page' => 30])));
    }]);
    register_rest_route('dongda/v1', '/export', ['methods' => 'GET', 'permission_callback' => fn() => current_user_can('dd_export_content') || current_user_can('dd_review_content'), 'callback' => function ($request) {
        $scope = $request->get_param('scope') ?: 'published'; if (!in_array($scope, ['published', 'preview'], true)) { return dd_content_error('dd_scope', '未知导出范围。'); }
        $posts = dd_content_posts($scope); if (is_wp_error($posts)) { return $posts; }
        $records = array_map('dd_content_record', $posts);
        foreach ($records as &$record) { $record['modifiedAt'] = str_replace(' ', 'T', $record['modifiedAt']); } unset($record);
        return ['schema' => dd_content_seed()['schema'], 'scope' => $scope, 'records' => $records];
    }]);
    register_rest_route('dongda/v1', '/release', ['methods' => 'POST', 'permission_callback' => fn() => current_user_can('dd_edit_content'), 'callback' => 'dd_content_bridge']);
});
add_filter('rest_post_dispatch', function ($response, $server, $request) { if (str_starts_with($request->get_route(), '/dongda/v1/')) { $response->header('Cache-Control', 'private, no-store'); $response->header('X-Robots-Tag', 'noindex'); } return $response; }, 10, 3);
add_action('admin_menu', function () { add_menu_page('DongDa 内容', 'DongDa 内容', 'dd_edit_content', 'dongda-content', function () {
    echo '<div class="wrap dd-cms"><h1>DongDa 内容</h1><p class="dd-env">' . esc_html(wp_get_environment_type() === 'local' ? '本机 CMS · 未部署' : '内容发布') . '</p><div id="dd-cms-root"></div></div>';
}, 'dashicons-portfolio', 25); });
add_action('admin_enqueue_scripts', function ($hook) {
    if ($hook !== 'toplevel_page_dongda-content') { return; }
    wp_enqueue_style('dd-content', plugins_url('admin.css', __FILE__), [], '2026.10.09.3');
    wp_enqueue_script('dd-content', plugins_url('admin.js', __FILE__), [], '2026.10.09.3', true);
    wp_add_inline_script('dd-content', 'window.DongDaCms=' . wp_json_encode(['api' => rest_url('dongda/v1/'), 'nonce' => wp_create_nonce('wp_rest')]) . ';', 'before');
});
