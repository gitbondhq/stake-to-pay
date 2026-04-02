export type FakeDocument = {
  excerpt: string
  fullText: string
}

export const createFakeDocument = (title: string): FakeDocument => {
  const excerpt = [
    `${title}`,
    '',
    'Preview',
    'This report summarizes a fictional outage drill for a validator team.',
    'The full version includes the incident timeline, the root cause, and the remediation checklist.',
  ].join('\n')

  const fullText = [
    `${title}`,
    '====================',
    '',
    'Classification: Internal Demo',
    'Prepared by: Synthetic Reliability Desk',
    '',
    'Summary',
    'A simulated validator incident caused delayed attestations across two regions during a planned failover drill.',
    '',
    'Timeline',
    '08:04 UTC - Automated alerts detected elevated finalization latency.',
    '08:11 UTC - The primary signer pool stopped rotating after a stale feature flag remained enabled.',
    '08:19 UTC - Operators routed traffic to the backup signer set and restored normal throughput.',
    '',
    'Root Cause',
    'A stale rollout flag re-enabled an old signer selection path. That path accepted the new node inventory but never refreshed the rotation window after failover.',
    '',
    'Remediation',
    '1. Remove the stale flag from the deployment manifest.',
    '2. Add a smoke test that exercises signer rotation immediately after region failover.',
    '3. Require a post-deploy config diff before promoting emergency changes.',
    '',
    'Follow-up',
    'The next drill should validate recovery from an RPC brownout and should record a signed handoff between incident commander rotations.',
  ].join('\n')

  return { excerpt, fullText }
}
