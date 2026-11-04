import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

export async function notify(title, body) {
  try {
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
    if (granted) sendNotification({ title, body })
  } catch (err) {
    console.error('notify failed:', err)
  }
}