import copy
import unittest
from dry_run import plan


class MigrationPlanTests(unittest.TestCase):
    def test_plan_does_not_change_any_original_field(self):
        rows = [{'id': {'S': 'fixture'}, 'year': {'N': '2025'}, 'owner': {'S': 'subject::old-name'},
                 'unknown': {'L': [{'NULL': True}, {'S': 'ordered'}]}}]
        users = [{'Attributes': [{'Name': 'sub', 'Value': 'subject'}]}]
        original = copy.deepcopy((rows, users))
        self.assertEqual(plan(rows, users)['original_row_changes'], 0)
        self.assertEqual((rows, users), original)

    def test_ambiguous_or_unmapped_subject_fails_closed(self):
        rows = [{'id': {'S': 'fixture'}, 'year': {'N': '2025'}, 'owner': {'S': 'subject::old-name'}}]
        users = [{'Attributes': [{'Name': 'sub', 'Value': 'subject'}]}]
        with self.assertRaises(AssertionError):
            plan(rows * 2, users)
        with self.assertRaises(AssertionError):
            plan(rows, [])


if __name__ == '__main__':
    unittest.main()
