<?php
defined('ABSPATH') || exit;

final class WC_Gateway_Payflow_Test extends WC_Payment_Gateway {
    public function __construct() {
        $this->id = 'payflow_test';
        $this->has_fields = false;
        $this->method_title = 'Payflow test checkout';
        $this->method_description = 'Staging-only connection to Payflow. Configure the test key in wp-config.php. Simulations never mark WooCommerce orders paid or trigger fulfilment.';
        $this->title = 'Payflow test checkout';
        $this->description = 'Test payment only. No money is collected.';
        $this->supports = array('products');
        $this->init_form_fields();
        $this->init_settings();
        $this->enabled = $this->get_option('enabled', 'no');
        add_action('woocommerce_update_options_payment_gateways_' . $this->id, array($this, 'process_admin_options'));
        add_action('woocommerce_receipt_' . $this->id, array($this, 'receipt'));
    }

    public function init_form_fields() {
        $this->form_fields = array('enabled' => array('title' => 'Enable on staging', 'type' => 'checkbox', 'label' => 'Enable Payflow test checkout', 'default' => 'no'));
    }

    public static function test_allowed() {
        return defined('PAYFLOW_ENABLE_TEST_CHECKOUT') && PAYFLOW_ENABLE_TEST_CHECKOUT === true &&
            in_array(wp_get_environment_type(), array('local', 'development', 'staging'), true);
    }

    private function client() {
        if (!self::test_allowed()) { throw new RuntimeException('Payflow test checkout is disabled on production stores.'); }
        return new Payflow_Sandbox_API(
            defined('PAYFLOW_API_ORIGIN') ? PAYFLOW_API_ORIGIN : 'https://payment-gateway-2fez.onrender.com',
            defined('PAYFLOW_CHECKOUT_ORIGIN') ? PAYFLOW_CHECKOUT_ORIGIN : 'https://merchant-web-chi.vercel.app',
            defined('PAYFLOW_TEST_SECRET_KEY') ? PAYFLOW_TEST_SECRET_KEY : ''
        );
    }

    public function is_available() {
        if (!self::test_allowed() || get_woocommerce_currency() !== 'INR' || !parent::is_available()) { return false; }
        try { $this->client(); return true; } catch (RuntimeException $error) { return false; }
    }

    private function seed($order) { return hash('sha256', 'payflow-test:' . $order->get_order_key()); }

    public function process_payment($order_id) {
        try {
            if (!$this->is_available()) { throw new RuntimeException('Payflow test checkout is not configured for this staging store.'); }
            $order = wc_get_order($order_id);
            if (!$order || $order->get_currency() !== 'INR' || !$order->needs_payment()) { throw new RuntimeException('This order is not payable.'); }
            $amount = Payflow_Sandbox_API::minor_amount((string) $order->get_total());
            $seed = $this->seed($order);
            $reference = 'WC-' . $order->get_id() . '-' . substr($seed, 0, 16);
            // Stable keys prevent duplicate platform orders even if the response or PHP request is lost.
            $id = $this->client()->create_order($amount, $reference, 'wc-order-' . $seed);
            $order->update_meta_data('_payflow_test_order_id', $id);
            $order->update_meta_data('_payflow_test_amount', $amount);
            $order->update_meta_data('_payflow_test_reference', $reference);
            $order->save();
            return array('result' => 'success', 'redirect' => $order->get_checkout_payment_url(true));
        } catch (RuntimeException $error) {
            wc_add_notice($error->getMessage(), 'error');
            return array('result' => 'failure');
        }
    }

    private function authorized_order($id, $key) {
        $order = wc_get_order($id);
        if (!$order || $order->get_payment_method() !== $this->id || !is_string($key) || !hash_equals($order->get_order_key(), $key)) {
            throw new RuntimeException('Order could not be verified.');
        }
        return $order;
    }

    public function receipt($order_id) {
        try {
            $order = $this->authorized_order($order_id, isset($_GET['key']) ? sanitize_text_field(wp_unslash($_GET['key'])) : '');
            $id = $order->get_meta('_payflow_test_order_id');
            $url = $this->client()->checkout_url($id, 'wc-checkout-' . $this->seed($order));
            wp_enqueue_script('payflow-test-receipt', plugins_url('../assets/receipt.js', __FILE__), array(), '0.1.0', true);
            echo '<section id="payflow-test-receipt" data-order="' . esc_attr($order->get_id()) . '" data-key="' . esc_attr($order->get_order_key()) . '" data-nonce="' . esc_attr(wp_create_nonce('payflow-test-' . $order->get_id())) . '" data-status-url="' . esc_url(WC()->api_request_url('payflow_test_status')) . '">';
            echo '<h2>Payflow test checkout</h2><p>Open checkout in a new tab. This page will check the saved test result. No real money is collected and this order will not be marked paid.</p>';
            echo '<p><a class="button" target="_blank" rel="noopener noreferrer" href="' . esc_url($url) . '">Open test checkout</a></p>';
            echo '<p id="payflow-test-result" role="status">Waiting for a test result…</p><button type="button" id="payflow-test-refresh">Check test result</button></section>';
        } catch (RuntimeException $error) { echo '<p>' . esc_html($error->getMessage()) . '</p>'; }
    }

    public function status_request() {
        nocache_headers();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { wp_send_json_error(array('message' => 'POST required'), 405); }
        try {
            $id = isset($_POST['order']) ? absint($_POST['order']) : 0;
            $key = isset($_POST['key']) ? sanitize_text_field(wp_unslash($_POST['key'])) : '';
            $nonce = isset($_POST['nonce']) ? sanitize_text_field(wp_unslash($_POST['nonce'])) : '';
            $order = $this->authorized_order($id, $key);
            if (!wp_verify_nonce($nonce, 'payflow-test-' . $id)) { throw new RuntimeException('Reload the order page before checking again.'); }
            $throttle = 'payflow_test_poll_' . $id;
            if (get_transient($throttle)) { wp_send_json_error(array('message' => 'Please wait before checking again.'), 429); }
            set_transient($throttle, 1, 3);
            $amount = Payflow_Sandbox_API::minor_amount((string) $order->get_total());
            if ($order->get_currency() !== 'INR' || (int) $order->get_meta('_payflow_test_amount') !== $amount) { throw new RuntimeException('The store order changed; result rejected.'); }
            $result = $this->client()->verify_order($order->get_meta('_payflow_test_order_id'), $amount, $order->get_meta('_payflow_test_reference'));
            $previous = $order->get_meta('_payflow_test_result');
            if (in_array($result['status'], array('captured', 'refunded'), true) && $previous !== $result['status']) {
                $order->update_meta_data('_payflow_test_result', $result['status']);
                $order->update_meta_data('_payflow_test_payment_id', $result['paymentId']);
                $order->add_order_note('Payflow sandbox result: ' . $result['status'] . '. No real payment occurred; do not fulfil this test order.');
                $order->save();
            }
            // Deliberately never calls payment_complete(), reduces stock or marks an order paid.
            wp_send_json_success(array('status' => $result['status'], 'mode' => 'sandbox-only', 'canFulfill' => false));
        } catch (RuntimeException $error) { wp_send_json_error(array('message' => $error->getMessage()), 400); }
    }
}
