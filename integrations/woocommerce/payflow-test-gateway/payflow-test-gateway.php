<?php
/**
 * Plugin Name: Payflow Test Checkout
 * Description: Connect a staging WooCommerce store to Payflow sandbox checkout. Does not accept real payments or mark orders paid.
 * Version: 0.1.0
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 * Text Domain: payflow-test
 */
defined('ABSPATH') || exit;

add_action('before_woocommerce_init', static function () {
    if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

add_action('plugins_loaded', static function () {
    if (!class_exists('WC_Payment_Gateway')) { return; }
    require_once __DIR__ . '/includes/class-payflow-sandbox-api.php';
    require_once __DIR__ . '/includes/class-wc-gateway-payflow-test.php';
    add_filter('woocommerce_payment_gateways', static function ($methods) {
        $methods[] = 'WC_Gateway_Payflow_Test';
        return $methods;
    });
    add_action('woocommerce_api_payflow_test_status', static function () {
        $gateway = new WC_Gateway_Payflow_Test();
        $gateway->status_request();
    });
});

add_action('woocommerce_blocks_loaded', static function () {
    if (!class_exists('Automattic\\WooCommerce\\Blocks\\Payments\\Integrations\\AbstractPaymentMethodType')) { return; }
    require_once __DIR__ . '/includes/class-payflow-test-blocks.php';
    add_action('woocommerce_blocks_payment_method_type_registration', static function ($registry) {
        $registry->register(new Payflow_Test_Blocks());
    });
});
