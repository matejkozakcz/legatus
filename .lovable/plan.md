

## Problém

Lucie (garant) vidí sebe dvakrát v org chartu. Příčina je v garant-view logice (řádky 206-213), která nastaví vedoucího jako root a sebe jako second level — ale nefiltruje správně, takže dochází k duplikaci.

## Navrhovaná oprava — `OrgChart.tsx`

### Garant view (řádky 206-213)

Upravit logiku tak, aby garant viděl:
1. **Root**: svého vedoucího (pokud existuje)
2. **Second level**: sebe samotného
3. **Third level**: své nováčky (`garant_id === currentUser.id`)

Klíčová změna: zajistit, že `rootNode` a `secondLevelNodes` nikdy neobsahují stejnou osobu, a že se garant nezobrazí dvakrát.

### Vedoucí view (řádky 186-205)

Přidat explicitní filtr: `secondLevelNodes` nesmí obsahovat `rootNode.id` (prevence duplikace při edge cases).

### Souhrnně

Jde o jednosouborovou opravu v `OrgChart.tsx` — cca 5 řádků změn v podmínkových větvích, bez změny dat ani queries.

