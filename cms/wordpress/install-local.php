<?php
$input = json_decode(stream_get_contents(STDIN), true);
if (!is_array($input) || !isset($input['adminPassword'], $input['reviewerPassword'], $input['authorPassword'])) { throw new RuntimeException('Private local setup input required'); }
define('WP_INSTALLING', true);
require '/var/www/html/wp-load.php';
if (wp_get_environment_type() !== 'local') { throw new RuntimeException('Local environment required'); }
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
if (!is_blog_installed()) { wp_install('DongDa Local CMS', 'dd-cms-admin', 'cms-local@example.test', false, '', $input['adminPassword']); }
update_option('siteurl', 'http://127.0.0.1:4192'); update_option('home', 'http://127.0.0.1:4192'); update_option('blog_public', 0);
$result = activate_plugin('dongda-content/dongda-content.php'); if (is_wp_error($result)) { throw new RuntimeException('Plugin activation failed'); }
require_once WP_PLUGIN_DIR . '/dongda-content/dongda-content.php';
do_action('init');
$users = [['dd-cms-reviewer', 'dd_content_reviewer', $input['reviewerPassword']], ['dd-cms-author', 'dd_content_author', $input['authorPassword']], ['dd-cms-exporter', 'dd_content_exporter', wp_generate_password(40, true, true)]];
$identities = [];
foreach ($users as [$login, $role, $password]) {
    $user = get_user_by('login', $login);
    if (!$user) { $id = wp_insert_user(['user_login' => $login, 'user_pass' => $password, 'role' => $role, 'user_email' => $login . '@example.test']); if (is_wp_error($id)) { throw new RuntimeException('Local identity creation failed'); } $user = get_user_by('id', $id); }
    $identities[$login] = $user->ID;
}
$added = 0;
foreach (dd_content_seed()['records'] as $record) {
    $existing = get_posts(['post_type' => 'dd_content', 'post_status' => 'any', 'meta_key' => '_dd_id', 'meta_value' => $record['id'], 'numberposts' => 1]); if ($existing) { continue; }
    $id = wp_insert_post(['post_type' => 'dd_content', 'post_status' => 'draft', 'post_title' => $record['data']['name']['zh'], 'post_author' => $identities['dd-cms-author']], true);
    if (is_wp_error($id)) { throw new RuntimeException('Content import failed'); }
    foreach (['_dd_id' => $record['id'], '_dd_kind' => $record['kind'], '_dd_baseline' => $record['baselineHash'], '_dd_payload' => wp_json_encode($record['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), '_dd_version' => 1] as $key => $value) { update_post_meta($id, $key, wp_slash($value)); }
    wp_save_post_revision($id); $added++;
}
$passwords = [];
if (empty($input['existingApplicationPasswords'])) {
    foreach ($identities as $login => $id) { $created = WP_Application_Passwords::create_new_application_password($id, ['name' => 'DongDa local acceptance']); if (is_wp_error($created)) { throw new RuntimeException('Application password creation failed'); } $passwords[$login] = $created[0]; }
}
echo wp_json_encode(['version' => $GLOBALS['wp_version'], 'php' => PHP_VERSION, 'newRecords' => $added, 'users' => $identities, 'applicationPasswords' => $passwords]);
