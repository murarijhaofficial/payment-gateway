/* WooCommerce supplies these APIs; no merchant secret is sent to this script. */
(() => {
  const data = globalThis.wc.wcSettings.getSetting('payflow_test_data', {});
  const createElement = globalThis.wp.element.createElement;
  globalThis.wc.wcBlocksRegistry.registerPaymentMethod({
    name: 'payflow_test', paymentMethodId: 'payflow_test',
    label: createElement('span', null, data.title || 'Payflow test checkout'),
    content: createElement('p', null, data.description),
    edit: createElement('p', null, data.description),
    ariaLabel: 'Payflow test checkout', canMakePayment: () => data.enabled === true,
    supports: { features: ['products'] },
  });
})();
