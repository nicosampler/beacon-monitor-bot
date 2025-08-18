** Process Epoch **

Epoch rewards, endpoint: /eth/v1/beacon/rewards/attestations/{epoch}
devuelve un array de:

ideal_rewards: [...]
total_rewards: [...]

* al ppio de cada epoch:
- esperar q se haya procesado el slot del ultimo epoch, ya que cada slot procesado, nos devuelve info de: nuevos validadores, slasheados, exited, etc. Cada bloque q tiene actividad de validadores, dispara un fetch para actualizar el estado de esos validadores.
- hacemos fetch los los effective balances de los validadores, para poder saber los ideal rewards vs received rewards.
- hacemos fetch de beacon rewards para  de todos los validadores activos. 

** Process Slot **

Por cada slot, procesar los cambios de estados de los validadores, la data viene en el mismo endpoint.

** Fetch Balances **

Lo q necesitamos para missed-rewards, son los fetchValidators, ya q nos actualizan los estados de los validadores y el effective_balance. 

Fetch Balances, es un proceso q solo lo deberiamos hacer para los validadores registrados y cada un periodo grande de tiempo, no menor a 1h. 
