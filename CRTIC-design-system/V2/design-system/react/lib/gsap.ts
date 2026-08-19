// Single place that registers GSAP plugins. Import { gsap, ScrollTrigger } from here.
// Peer deps: gsap. Optional: @gsap/react for the useGSAP() hook in your app.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }
