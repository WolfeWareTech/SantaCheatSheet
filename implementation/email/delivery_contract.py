"""Offline P15 delivery-observation interface. No AWS clients, sends or logging."""
import datetime
import hashlib
import hmac

VERSION = 1
EVENT_STATUS = {
    'Send': 'accepted', 'Delivery': 'delivered', 'Bounce': 'bounced',
    'Complaint': 'complained', 'Reject': 'rejected',
    'Rendering Failure': 'rendering_failed', 'RenderingFailure': 'rendering_failed',
    'DeliveryDelay': 'delayed',
}


def _digest(key, kind, value):
    if not isinstance(key, bytes) or len(key) < 32:
        raise ValueError('A private correlation key of at least 32 bytes is required')
    return hmac.new(key, (kind + '\0' + value).encode(), hashlib.sha256).hexdigest()


def _time(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(datetime.timezone.utc).isoformat()
    except ValueError:
        return None


def queued_observation(queue_id, key):
    """Call only after P15 has durably queued a job. Not a provider receipt."""
    if not isinstance(queue_id, str) or not 1 <= len(queue_id) <= 256:
        raise ValueError('A bounded opaque queue ID is required')
    return {'version': VERSION, 'status': 'queued',
            'queueDigest': _digest(key, 'queue', queue_id)}


def accepted_observation(response, key):
    """SES SendEmail MessageId means accepted, never delivered."""
    message_id = response.get('MessageId') if isinstance(response, dict) else None
    if not isinstance(message_id, str) or not 1 <= len(message_id) <= 256:
        return {'version': VERSION, 'status': 'unknown'}
    return {'version': VERSION, 'status': 'accepted',
            'messageDigest': _digest(key, 'message', message_id)}


def event_observation(event, key):
    """Normalize an already-authenticated SES event; never log the raw input.

    Transport authentication, encryption, retention, replay protection, and
    persistence are P15 integration work. This function proves no event origin.
    mail.timestamp is the original send time; use the event-specific timestamp.
    """
    unknown = {'version': VERSION, 'status': 'unknown'}
    if not isinstance(event, dict):
        return unknown
    kind = event.get('eventType')
    if not isinstance(kind, str) or kind not in EVENT_STATUS:
        return unknown
    mail = event.get('mail')
    message_id = mail.get('messageId') if isinstance(mail, dict) else None
    if not isinstance(message_id, str) or not 1 <= len(message_id) <= 256:
        return unknown
    status = EVENT_STATUS[kind]
    section = {'accepted': 'send', 'delivered': 'delivery', 'bounced': 'bounce',
               'complained': 'complaint', 'rejected': 'reject',
               'rendering_failed': 'failure', 'delayed': 'deliveryDelay'}[status]
    details = event.get(section)
    timestamp = _time(details.get('timestamp')) if isinstance(details, dict) else None
    result = {'version': VERSION, 'status': status,
              'messageDigest': _digest(key, 'message', message_id)}
    if timestamp:
        result['observedAt'] = timestamp
    # A fingerprint of this observation, not a countable unique recipient event.
    result['observationDigest'] = _digest(key, 'observation', message_id + '\0' + status + '\0' + (timestamp or ''))
    return result
