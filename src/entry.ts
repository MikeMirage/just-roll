if (new URLSearchParams(location.search).get('mode') === 'inferno') {
  void import('./inferno/main');
} else {
  void import('./main');
}
