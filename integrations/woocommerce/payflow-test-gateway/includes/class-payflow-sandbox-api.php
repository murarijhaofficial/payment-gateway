<?php
/** Server-side sandbox transport. Never marks an order as genuinely paid. */
defined('ABSPATH') || exit;

final class Payflow_Sandbox_API {
    private $origin;
    private $checkout;
    private $key;

    public function __construct($origin, $checkout, $key) {
        $this->origin = self::origin($origin);
        $this->checkout = self::origin($checkout);
        if (!is_string($key) || !preg_match('/^sb_test_[A-Za-z0-9_-]{43}$/D', $key)) {
            throw new RuntimeException('Configure a collection-enabled Payflow test key on the server.');
        }
        $this->key = $key;
    }

    private static function origin($value) {
        $url = is_string($value) ? parse_url($value) : false;
        if (!$url || ($url['scheme'] ?? '') !== 'https' || empty($url['host']) ||
            isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment']) ||
            !in_array($url['path'] ?? '', array('', '/'), true) ||
            (isset($url['port']) && $url['port'] !== 443)) {
            throw new RuntimeException('Payflow origins must be HTTPS without paths or credentials.');
        }
        return rtrim($value, '/');
    }

    public static function minor_amount($total) {
        if (!is_string($total) || !preg_match('/^([0-9]{1,7})(?:\.([0-9]{1,2}))?$/D', $total, $parts)) {
            throw new RuntimeException('Payflow requires an INR total with at most two decimal places.');
        }
        $amount = (int) $parts[1] * 100 + (int) str_pad($parts[2] ?? '', 2, '0');
        if ($amount < 1 || $amount > 100000000) {
            throw new RuntimeException('Order total is outside the supported sandbox range.');
        }
        return $amount;
    }

    private static function identifier($id) {
        if (!is_string($id) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $id)) {
            throw new RuntimeException('Invalid Payflow order ID.');
        }
    }

    private function request($path, $method = 'GET', $body = null, $idempotency = null) {
        $headers = array('Authorization' => 'Bearer ' . $this->key, 'Content-Type' => 'application/json');
        if ($idempotency !== null) {
            if (!preg_match('/^[a-zA-Z0-9_-]{16,100}$/D', $idempotency)) {
                throw new RuntimeException('Invalid idempotency key.');
            }
            $headers['Idempotency-Key'] = $idempotency;
        }
        $args = array('method' => $method, 'headers' => $headers, 'timeout' => 20, 'redirection' => 0, 'sslverify' => true, 'limit_response_size' => 65536);
        if ($body !== null) { $args['body'] = wp_json_encode($body); }
        $response = wp_safe_remote_request($this->origin . '/v1/sandbox' . $path, $args);
        if (is_wp_error($response)) { throw new RuntimeException('Payflow is unreachable. Retry the same order.'); }
        $status = wp_remote_retrieve_response_code($response);
        if ($status < 200 || $status >= 300) { throw new RuntimeException('Payflow rejected the request. Check the server configuration and test key scope.'); }
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($data) || ($data['mode'] ?? '') !== 'sandbox-only') {
            throw new RuntimeException('Unexpected payment environment; result rejected.');
        }
        return $data;
    }

    public function create_order($amount, $reference, $key) {
        if (!is_int($amount) || $amount < 1 || $amount > 100000000 || !is_string($reference) || strlen($reference) < 1 || strlen($reference) > 100) {
            throw new RuntimeException('Invalid order amount or reference.');
        }
        $data = $this->request('/orders', 'POST', array('amountMinor' => $amount, 'reference' => $reference, 'expiresInMinutes' => 1440), $key);
        self::identifier($data['id'] ?? null);
        if (($data['amountMinor'] ?? null) !== $amount || ($data['currency'] ?? '') !== 'INR') {
            throw new RuntimeException('Payflow order does not match the purchase.');
        }
        return $data['id'];
    }

    public function checkout_url($id, $key) {
        self::identifier($id);
        $data = $this->request('/orders/' . $id . '/checkout', 'POST', null, $key);
        if (($data['id'] ?? '') !== $id || !is_string($data['checkoutToken'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $data['checkoutToken'])) {
            throw new RuntimeException('Invalid checkout response.');
        }
        return $this->checkout . '/pay#token=' . rawurlencode($data['checkoutToken']);
    }

    public function verify_order($id, $amount, $reference) {
        self::identifier($id);
        $data = $this->request('/orders/' . $id);
        if (($data['id'] ?? '') !== $id || ($data['amountMinor'] ?? null) !== $amount ||
            ($data['reference'] ?? '') !== $reference || ($data['currency'] ?? '') !== 'INR' ||
            !in_array($data['status'] ?? '', array('active', 'paid', 'cancelled', 'expired'), true)) {
            throw new RuntimeException('Order verification failed; no order changes made.');
        }
        $payment = $data['payment'] ?? null;
        if ($payment !== null && (!is_array($payment) || ($payment['amountMinor'] ?? null) !== $amount || !in_array($payment['status'] ?? '', array('captured', 'refunded'), true))) {
            throw new RuntimeException('Payment verification failed; no order changes made.');
        }
        if ($data['status'] === 'paid' && $payment === null) { throw new RuntimeException('Paid order has no verified payment.'); }
        return array('status' => $payment['status'] ?? $data['status'], 'mode' => 'sandbox-only', 'canFulfill' => false, 'paymentId' => $payment['id'] ?? null);
    }
}
