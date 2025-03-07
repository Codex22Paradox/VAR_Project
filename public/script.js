const saveLastMinute = document.getElementById('saveLastMinute');

const doFetch = async () => (await fetch("/save-last-minute")).json();

saveLastMinute.onclick = async () => console.log("pressione button... " + JSON.stringify(await doFetch()))

document.addEventListener('keydown', async (event) => {
    if (event.code === "Space") {
        event.preventDefault();
        console.log("pressione spazio.." + JSON.stringify(await doFetch()))
    }
})