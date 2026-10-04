// Registration must happen at module scope, before React renders, so Android
// can invoke the task when it launches the JS runtime without any mounted UI.
import './services/LocationTask';
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
