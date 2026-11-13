<?php
defined('ABSPATH') || exit;

final class Payflow_Test_Blocks extends \Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType {
    protected $name = 'payflow_test';
    private $gateway;
    public function initialize() { $this->gateway = new WC_Gateway_Payflow_Test(); }
    public function is_active() { return $this->gateway && $this->gateway->is_available(); }
    public function get_payment_method_script_handles() {
        wp_register_script('payflow-test-blocks', plugins_url('../assets/blocks.js', __FILE__), array('wc-blocks-registry', 'wc-settings', 'wp-element'), '0.1.0', true);
        return array('payflow-test-blocks');
    }
    public function get_payment_method_data() {
        return array('title' => 'Payflow test checkout', 'description' => 'Sandbox only. No money is collected and orders are not marked paid.', 'enabled' => $this->is_active(), 'supports' => array('products'));
    }
}
