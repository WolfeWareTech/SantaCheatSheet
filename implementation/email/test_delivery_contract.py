import json
import pathlib
import unittest
from delivery_contract import accepted_observation, event_observation, queued_observation

KEY = bytes(range(32))  # synthetic offline key, never a deployed secret


class DeliveryContractTests(unittest.TestCase):
    def test_queued_and_provider_acceptance_are_distinct(self):
        self.assertEqual(queued_observation('synthetic-job', KEY)['status'], 'queued')
        accepted = accepted_observation({'MessageId': 'synthetic-message'}, KEY)
        self.assertEqual(accepted['status'], 'accepted')
        self.assertNotEqual(accepted['status'], 'delivered')

    def test_statuses_drop_private_raw_values(self):
        for kind, status, section in [
            ('Send', 'accepted', 'send'), ('Delivery', 'delivered', 'delivery'),
            ('Bounce', 'bounced', 'bounce'), ('Complaint', 'complained', 'complaint'),
            ('Reject', 'rejected', 'reject'), ('Rendering Failure', 'rendering_failed', 'failure'),
            ('DeliveryDelay', 'delayed', 'deliveryDelay')]:
            with self.subTest(kind=kind):
                raw = {'eventType': kind, 'mail': {'messageId': 'synthetic-message',
                    'source': 'sender@example.invalid', 'destination': ['recipient@example.invalid'],
                    'headers': [{'name': 'Subject', 'value': 'PRIVATE-CONTENT'}],
                    'tags': {'invitation': ['PRIVATE-TOKEN']}, 'timestamp': '2026-11-13T10:00:00Z'},
                    section: {'timestamp': '2026-11-13T11:00:00Z', 'diagnosticCode': 'PRIVATE-ERROR',
                              'bouncedRecipients': [{'emailAddress': 'recipient@example.invalid'}]}}
                result = event_observation(raw, KEY)
                self.assertEqual(result['status'], status)
                self.assertEqual(result['observedAt'], '2026-11-13T11:00:00+00:00')
                self.assertEqual(set(result), {'version', 'status', 'messageDigest', 'observationDigest', 'observedAt'})
                rendered = json.dumps(result)
                for private in ['@', 'PRIVATE', 'synthetic-message', '10:00:00']:
                    self.assertNotIn(private, rendered)
                self.assertEqual(result['messageDigest'], accepted_observation({'MessageId': 'synthetic-message'}, KEY)['messageDigest'])
                self.assertEqual(event_observation(raw, KEY), result)
                self.assertNotEqual(event_observation(raw, b'x' * 32)['messageDigest'], result['messageDigest'])

    def test_unknown_or_malformed_input_never_echoed(self):
        for event in [None, [], {'eventType': []}, {'eventType': 'recipient@example.invalid'},
                      {'eventType': 'Bounce', 'mail': {}}, {'eventType': 'Open', 'mail': {'messageId': 'x'}}]:
            self.assertEqual(event_observation(event, KEY), {'version': 1, 'status': 'unknown'})
        result = event_observation({'eventType': 'Delivery', 'mail': {'messageId': 'x'},
            'delivery': {'timestamp': 'recipient@example.invalid'}}, KEY)
        self.assertNotIn('observedAt', result)

    def test_correlation_requires_private_key(self):
        for key in [None, b'short', 'not-bytes']:
            with self.assertRaises(ValueError):
                accepted_observation({'MessageId': 'x'}, key)

    def test_template_privacy_and_authority_boundaries(self):
        template = json.loads(pathlib.Path(__file__).with_name('readiness.template.json').read_text())
        resources = template['Resources']
        self.assertEqual(len(resources), 3)
        self.assertEqual(resources['EmailConfiguration']['Properties']['SendingOptions'], {'SendingEnabled': False})
        destination = resources['DeliveryMetrics']['Properties']['EventDestination']
        self.assertEqual(set(k for k in destination if k.endswith('Destination')), {'CloudWatchDestination'})
        self.assertEqual(destination['CloudWatchDestination']['DimensionConfigurations'][0]['DimensionName'], 'ses:configuration-set')
        self.assertNotIn('OPEN', destination['MatchingEventTypes'])
        policy = resources['UnattachedSenderPolicy']['Properties']
        self.assertTrue({'Roles', 'Users', 'Groups'}.isdisjoint(policy))
        statement = policy['PolicyDocument']['Statement'][0]
        self.assertEqual(statement['Action'], ['ses:SendEmail'])
        self.assertNotIn('*', json.dumps(statement))
        for resource in resources.values():
            self.assertEqual(resource['Condition'], 'SelectedRegion')


if __name__ == '__main__':
    unittest.main()
