import "./Sidebar.css";

const menu = [
    "Direkt Satış",
    "Masalar",
    "Paket",
    "Ürünler",
    "Raporlar",
    "Ayarlar"
];

export default function Sidebar(){

    return(

        <aside className="sidebar">

            {menu.map(item=>(
                <button
                    key={item}
                    className="menu-button"
                >
                    {item}
                </button>
            ))}

        </aside>

    );

}