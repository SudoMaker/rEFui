import { If, signal, watch } from 'refui'

const count = signal(0)
watch(() => { if (count.value < 3) count.value++ })
export const view = <If condition={count}><span>Intentional eager child</span></If>
