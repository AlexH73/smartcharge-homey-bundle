return await runCanonicalDecision({
  stabilityShadow:
    typeof stabilityShadow === 'undefined' ? null : stabilityShadow,
});
